'use strict';

const BigNumber = require("bignumber.js");

module.exports = class ProcessDotMintFromPolka {
  constructor(frameworkService) {
    this.m_frameworkService = frameworkService;
  }

  async process(stepData, wallet) {
    let webStores = this.m_frameworkService.getService("WebStores");
    let polkadotService = this.m_frameworkService.getService("PolkadotService");
    // console.debug("ProcessDotMintFromPolka stepData:", stepData);
    let params = stepData.params;
    try {
      let memo = await wallet.buildUserLockData(params.tokenPairID, params.userAccount, params.fee);
      console.debug("ProcessDotMintFromPolka memo: %s", memo);

      let api = await polkadotService.getApi();

      // 1 根据storemanGroupPublicKey 生成storemanGroup的DOT地址
      let storemanGroupAddr = await polkadotService.longPubKeyToAddress(params.storemanGroupGpk);
      //console.log("storemanGroupAddr:", storemanGroupAddr);

      // 2 生成交易串
      let txValue = '0x' + new BigNumber(params.value).toString(16);
      let txs = [
        api.tx.system.remark(memo),
        api.tx.balances.transferKeepAlive(storemanGroupAddr, txValue)
      ];
      // console.debug("txs:", txs);

      // 3 check balance >= (value + gasFee + minReserved)
      let balance = await polkadotService.getBalance(params.fromAddr);
      let gasFee = await polkadotService.estimateFee(params.fromAddr, txs);
      let chainInfoService = this.m_frameworkService.getService("ChainInfoService");
      let chainInfo = await chainInfoService.getChainInfoByType("DOT");
      let minReserved = new BigNumber(chainInfo.minReserved);
      minReserved = minReserved.multipliedBy(Math.pow(10, chainInfo.chainDecimals));
      let totalNeed = new BigNumber(params.value).plus(gasFee).plus(minReserved);
      if (new BigNumber(balance).lte(totalNeed)) {
        console.error("ProcessDotMintFromPolka insufficient balance, fee: %s", gasFee.div(Math.pow(10, chainInfo.chainDecimals)).toFixed());
        webStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Failed", "Insufficient balance");
        return;
      }

      // 5 签名并发送
      let txHash;
      try {
        txHash = await wallet.sendTransaction(txs, params.fromAddr);
        webStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, stepData.stepIndex, txHash, ""); // only update txHash, no result
      } catch (err) {
        if (err.message === "Cancelled") {
          webStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Rejected");
        } else {
          console.error("polkadot sendTransaction error: %O", err);
          webStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Failed", err.message || "Failed to send transaction");
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
      console.error("ProcessDotMintFromPolka error: %O", err);
      webStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Failed", err.message || "Failed to send transaction");
    }
  }
};