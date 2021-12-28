'use strict';
let BigNumber = require("bignumber.js");

module.exports = class ProcessAdaMintFromCardano {
  constructor(frameworkService) {
    this.m_frameworkService = frameworkService;
  }

  async process(stepData, wallet) {
    let WebStores = this.m_frameworkService.getService("WebStores");
    let polkadotService = this.m_frameworkService.getService("PolkadotService");
    //console.debug("ProcessAdaMintFromCardano stepData:", stepData);
    let params = stepData.params;
    try {
      let memo = await wallet.buildUserLockData(params.tokenPairID, params.userAccount, params.fee);
      console.debug("ProcessAdaMintFromCardano memo:", memo);

      // 1 根据storemanGroupPublicKey 生成storemanGroup的DOT地址
      let storemanGroupAddr = await polkadotService.longPubKeyToAddress(params.storemanGroupGpk);
      //console.log("storemanGroupAddr:", storemanGroupAddr);

      // 2 生成交易串
      let totalTransferValue = '0x' + new BigNumber(params.value).toString(16);
      let txs = [
        api.tx.system.remark(memo),
        api.tx.balances.transferKeepAlive(storemanGroupAddr, totalTransferValue)
      ];
      // console.debug("txs:", txs);
      // 3 计算交易费用
      let estimateFee = await polkadotService.estimateFee(params.fromAddr, txs);

      // 4 校验:balance >= (value + estimateFee)
      let balance = await wallet.getBalance(params.fromAddr);
      balance = new BigNumber(balance);
      let totalNeed = new BigNumber(params.value).plus(estimateFee);
      if (balance.isLessThan(totalNeed)) {
        console.error("ProcessAdaMintFromCardano insufficient balance");
        WebStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Failed", "Insufficient balance");
        return;
      }

      // 5 签名并发送
      let txHash;
      try {
        txHash = await wallet.sendTransaction(txs, params.fromAddr);
        WebStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, stepData.stepIndex, txHash, ""); // only update txHash, no result
      } catch (err) {
        if (err.message === "Cancelled") {
          WebStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Rejected");
        } else {
          console.error("polkadot sendTransaction error: %O", err);
          WebStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Failed", err.message || "Failed to send transaction");
        }
        return;
      }

      // 查询目的链当前blockNumber
      let iwan = this.m_frameworkService.getService("iWanConnectorService");
      let blockNumber = await iwan.getBlockNumber(params.toChainType);
      let checkPara = {
        ccTaskId: params.ccTaskId,
        stepIndex: stepData.stepIndex,
        fromBlockNumber: blockNumber,
        txHash: txHash,
        chain: params.toChainType,
        smgPublicKey: params.storemanGroupGpk,
        taskType: "MINT"
      };

      let checkDotTxService = this.m_frameworkService.getService("CheckDotTxService");
      await checkDotTxService.addTask(checkPara);
    } catch (err) {
      console.error("ProcessAdaMintFromCardano error: %O", err);
      WebStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Failed", err.message || "Failed to send transaction");
    }
  }
};