'use strict';

const BigNumber = require("bignumber.js");
const tool = require("../../utils/tool.js");

// memo should like follows
// memo_Type + memo_Data, Divided Symbols should be '0x'
// Type: 1, normal userLock; Data: tokenPairID + toAccount + fee
// Type: 2, normal smg release; Data: tokenPairId + uniqueId/hashX
// Type: 3, abnormal smg transfer for memo_userLock; Data: uniqueId
// Type: 4, abnomral smg transfer for tag_userLock; Data: tag
// Type: 5, smg debt transfer; Data: srcSmg
const TX_TYPE = {
  userLock2Evm:    1,
  smgRelease:      2,
  userLock2NonEvm: 10
}

const MemoTypeLen = 2;
const TokenPairIDLen = 4;

module.exports = class ProcessDotMintFromPolka {
  constructor(frameworkService) {
    this.frameworkService = frameworkService;
    this.configService  = frameworkService.getService("ConfigService");
    this.extension = this.configService.getExtension("DOT");
    this.storemanService = frameworkService.getService("StoremanService");
    this.chainInfoService = frameworkService.getService("ChainInfoService");
  }

  async process(stepData, wallet) {
    let webStores = this.frameworkService.getService("WebStores");
    // console.debug("ProcessDotMintFromPolka stepData:", stepData);
    let params = stepData.params;
    try {
      let toChainInfo = this.chainInfoService.getChainInfoByType(params.toChainType);
      let memo = await this.buildUserLockData(params.tokenPairID, params.userAccount, toChainInfo);
      console.debug("ProcessDotMintFromPolka memo: %s", memo);

      let api = await wallet.getApi();

      // 1 根据storemanGroupPublicKey 生成storemanGroup的DOT地址
      let network = this.configService.getNetwork();
      let storemanGroupAddr = this.extension.tool.gpk2Address(params.storemanGroupGpk, "Polkadot", network);
      //console.log({storemanGroupAddr});

      // 2 生成交易串
      let txValue = '0x' + new BigNumber(params.value).toString(16);
      let txs = [
        api.tx.system.remark(memo),
        api.tx.balances.transferKeepAlive(storemanGroupAddr, txValue)
      ];
      // console.debug("txs:", txs);

      // 3 check balance >= (value + gasFee + minReserved)
      let balance = await wallet.getBalance(params.fromAddr);
      let gasFee = await wallet.estimateFee(params.fromAddr, txs);
      let chainInfo = this.chainInfoService.getChainInfoByType("DOT");
      let minReserved = new BigNumber(chainInfo.minReserved);
      minReserved = minReserved.multipliedBy(Math.pow(10, chainInfo.chainDecimals));
      let totalNeed = new BigNumber(params.value).plus(gasFee).plus(minReserved);
      if (new BigNumber(balance).lte(totalNeed)) {
        console.error("ProcessDotMintFromPolka insufficient balance, fee: %s", gasFee.div(Math.pow(10, chainInfo.chainDecimals)).toFixed());
        webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Failed", "Insufficient balance");
        return;
      }

      // 5 签名并发送
      let txHash = await wallet.sendTransaction(txs, params.fromAddr);
      webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, txHash, ""); // only update txHash, no result

      // 查询目的链当前blockNumber
      let blockNumber = await this.storemanService.getChainBlockNumber(params.toChainType);
      let checkPara = {
        ccTaskId: params.ccTaskId,
        stepIndex: stepData.stepIndex,
        fromBlockNumber: blockNumber,
        txHash,
        chain: params.toChainType,
        smgPublicKey: params.storemanGroupGpk,
        taskType: "MINT"
      };

      let checkDotTxService = this.frameworkService.getService("CheckDotTxService");
      await checkDotTxService.addTask(checkPara);
    } catch (err) {
      if (err.message === "Cancelled") {
        webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Rejected");
      } else {
        console.error("ProcessDotMintFromPolka error: %O", err);
        webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Failed", tool.getErrMsg(err, "Failed to send transaction"));
      }
    }
  }

  buildUserLockData(tokenPair, userAccount, toChainInfo) {
    let memo = "", txType;
    tokenPair = Number(tokenPair);
    if (toChainInfo._isEVM) {
      userAccount = tool.hexStrip0x(userAccount);
      txType = TX_TYPE.userLock2Evm;
    } else {
      userAccount = Buffer.from(userAccount).toString("hex");
      txType = TX_TYPE.userLock2NonEvm;
    }
    if ((tokenPair !== NaN) && userAccount) {
      let type = txType.toString(16).padStart(MemoTypeLen, 0);
      tokenPair = parseInt(tokenPair).toString(16).padStart(TokenPairIDLen, 0);
      memo = type + tokenPair + userAccount;
    } else {
      console.error("buildUserlockMemo parameter invalid");
    }
    return memo;
  }
};