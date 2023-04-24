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
  UserLock:   1,
  SmgRelease: 2,
  smgDebt:    5,
  Invalid:    -1
}

const MemoTypeLen = 2;
const TokenPairIDLen = 4;
const ToAccountLen = 40; // without '0x'

module.exports = class ProcessDotMintFromPolka {
  constructor(frameworkService) {
    this.frameworkService = frameworkService;
    this.configService  = frameworkService.getService("ConfigService");
    this.extension = this.configService.getExtension("DOT");
  }

  async process(stepData, wallet) {
    let webStores = this.frameworkService.getService("WebStores");
    // console.debug("ProcessDotMintFromPolka stepData:", stepData);
    let params = stepData.params;
    try {
      let memo = await this.buildUserLockData(params.tokenPairID, params.userAccount, params.fee);
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
      let chainInfoService = this.frameworkService.getService("ChainInfoService");
      let chainInfo = chainInfoService.getChainInfoByType("DOT");
      let minReserved = new BigNumber(chainInfo.minReserved);
      minReserved = minReserved.multipliedBy(Math.pow(10, chainInfo.chainDecimals));
      let totalNeed = new BigNumber(params.value).plus(gasFee).plus(minReserved);
      if (new BigNumber(balance).lte(totalNeed)) {
        console.error("ProcessDotMintFromPolka insufficient balance, fee: %s", gasFee.div(Math.pow(10, chainInfo.chainDecimals)).toFixed());
        webStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Failed", "Insufficient balance");
        return;
      }

      // 5 签名并发送
      let txHash = await wallet.sendTransaction(txs, params.fromAddr);
      webStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, stepData.stepIndex, txHash, ""); // only update txHash, no result

      // 查询目的链当前blockNumber
      let iwan = this.frameworkService.getService("iWanConnectorService");
      let blockNumber = await iwan.getBlockNumber(params.toChainType);
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
        webStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Rejected");
      } else {
        console.error("ProcessDotMintFromPolka error: %O", err);
        webStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Failed", tool.getErrMsg(err, "Failed to send transaction"));
      }
    }
  }

  buildUserLockData(tokenPair, userAccount, fee) {
    let memo = "";
    tokenPair = Number(tokenPair);
    userAccount = tool.hexStrip0x(userAccount);
    fee = new BigNumber(fee).toString(16);
    if ((tokenPair !== NaN) && (userAccount.length === ToAccountLen)) {
      let type = TX_TYPE.UserLock.toString(16).padStart(MemoTypeLen, 0);
      tokenPair = parseInt(tokenPair).toString(16).padStart(TokenPairIDLen, 0);
      memo = type + tokenPair + userAccount + fee;
    } else {
      console.error("buildUserlockMemo parameter invalid");
    }
    return memo;
  }
};