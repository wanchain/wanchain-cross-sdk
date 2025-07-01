'use strict';

const BigNumber = require("bignumber.js");
const tool = require("../../utils/tool.js");

const TON_COIN_ACCOUNT_STR = 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c';

const TokenType = {
  coin: 1,
  orig: 2,
  wrapped: 3
};

const CrossOpCode = {
  userLock: 0x40000001,
  userBurn: 0x40000003
}

const DefaultGas = 1_000_000_000;

module.exports = class ProcessMintFromTon {
  constructor(frameworkService) {
    this.frameworkService = frameworkService;
    this.webStores = this.frameworkService.getService("WebStores");
    this.configService  = frameworkService.getService("ConfigService");
    let extension = this.configService.getExtension("TON");
    this.tool = extension.tool;
    this.storemanService = frameworkService.getService("StoremanService");
    this.tokenPairService = frameworkService.getService("TokenPairService");
    this.iwan = frameworkService.getService("iWanConnectorService");
  }

  async process(stepData, wallet) {
    let params = stepData.params;
    try {
      let tokenPair = this.tokenPairService.getTokenPair(params.tokenPairID);
      let direction = (tokenPair.fromChainType === "TON");
      let fromChainInfo = direction? tokenPair.fromScInfo : tokenPair.toScInfo;
      let toChainInfo = direction? tokenPair.toScInfo : tokenPair.fromScInfo;
      let tokenAccount = direction? tokenPair.fromAccount : tokenPair.toAccount;
      let isCoin = (tokenAccount === "0x0000000000000000000000000000000000000000");
      let crossValue = isCoin? new BigNumber(params.value).minus(params.networkFee).toFixed(0) : params.value;
      let totalTon = new BigNumber(params.networkFee).plus(DefaultGas);
      if (isCoin) {
        totalTon = totalTon.plus(crossValue);
      }
      let queryId = await this.tool.getQueryId();
      let userAccountBuf = Buffer.from(tool.hexStrip0x(params.userAccount), 'hex');
      let userAccountBufLen = userAccountBuf.length;
      let isNativeToken = this.tokenPairService.checkNativeToken("", tokenPair.ancestorChainType, "TON", tokenAccount); // MUST call before decode ascii
      let jwSender, jwCrossSc;
      if (isCoin) {
        tokenAccount = jwSender = jwCrossSc = TON_COIN_ACCOUNT_STR;
      } else {
        tokenAccount = tool.ascii2letter(tokenAccount);
        jwSender = await this.iwan.getJettonWalletAddr(tokenAccount, params.fromAddr);
        jwCrossSc = await this.iwan.getJettonWalletAddr(tokenAccount, params.crossScAddr);
      }
      let extraCell = this.tool.beginCell()
        .storeAddress(this.tool.parseAddress(tokenAccount))
        .storeAddress(this.tool.parseAddress(jwSender))
        .storeAddress(this.tool.parseAddress(jwCrossSc))
        .endCell();
      let extraCell2 = this.tool.beginCell()
        .storeAddress(this.tool.parseAddress(params.fromAddr))
        .storeUint(params.networkFee, 256)
        .endCell();
      let body = this.tool.beginCell()
        .storeUint(CrossOpCode.userLock, 32)
        .storeUint(queryId, 64)
        .storeUint(BigInt(params.storemanGroupId), 256)
        .storeUint(params.tokenPairID, 32)
        .storeUint(crossValue, 256)
        .storeUint(userAccountBufLen, 8)
        .storeBuffer(userAccountBuf, userAccountBufLen)
        .storeRef(extraCell)
        .storeRef(extraCell2)
        .endCell();
      let msgTo, msgBody, lockType;
      if (isCoin) {
        msgTo = params.crossScAddr;
        msgBody = body;
        lockType = TokenType.coin;
      } else {
        msgTo = jwSender;
        msgBody = this.tool.beginCell()
        .storeUint(0xf8a7ea5, 32) // const int op::transfer = 0xf8a7ea5;
        .storeUint(queryId, 64)
        .storeCoins(crossValue)
        .storeAddress(this.tool.parseAddress(params.crossScAddr))  // receive address (token)
        .storeAddress(this.tool.parseAddress(params.fromAddr))
        .storeMaybeRef(null)
        .storeCoins(totalTon)
        .storeMaybeRef(body)
        .endCell();
        lockType = isNativeToken? TokenType.orig : TokenType.wrapped;
      }
      let msg = this.tool.buildInternalMessage({to: msgTo, body: msgBody, value: totalTon, bounce: true});
      let msgHash = this.tool.getMsgHash(msg);
      await wallet.sendTransaction([msg]);
      let tx = await this.iwan.getTranByMsgHash(msgHash);
      let txs = await this.iwan.getTranResultByTxHash(tx.txHash);
      let txHash = txs[0].txHash; // TODO: use cross contract txHash as unique id
      this.webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, txHash, ""); // only update txHash, no result
      let blockNumber = await this.storemanService.getChainBlockNumber(params.toChainType);
      let checker = {
        chain: "TON",
        ccTaskId: params.ccTaskId,
        stepIndex: stepData.stepIndex,
        txHash,
        txCheckInfo: null, // only check tx receipt, no event
        convertCheckInfo: {
          ccTaskId: params.ccTaskId,
          stepIndex: stepData.stepIndex,
          uniqueID: "0x" + txHash,
          chain: params.toChainType,
          fromBlockNumber: blockNumber,
          taskType: this.tokenPairService.getTokenEventType(params.tokenPairID, (direction? "MINT" : "BURN")),
        }
      };
      let checkTxReceiptService = this.frameworkService.getService("CheckTxReceiptService");
      await checkTxReceiptService.add(checker);
    } catch (err) {
      console.error("error: %s", err.message)
      if (["User rejected the request."].includes(err.message)) {
        this.webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Rejected");
      } else {
        console.error("ProcessMintFromTon error: %O", err);
        this.webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Failed", tool.getErrMsg(err, "Failed to send transaction"));
      }
    }
  }
};