'use strict';
let BigNumber = require("bignumber.js");

const axios = require("axios");


module.exports = class ProcessDotMintFromPolka {
  constructor(frameworkService) {
    this.m_frameworkService = frameworkService;
  }

  //let userFastMintParaJson = {
  //    "ccTaskId": convertJson.ccTaskId,
  //    "toChainType": tokenPairObj.toChainType,
  //    "userAccount": convertJson.toAddr,
  //    "storemanGroupId": convertJson.storemanGroupId,
  //    "storemanGroupGpk": convertJson.storemanGroupGpk,
  //    "tokenPairID": convertJson.tokenPairId,
  //    "value": value,
  //    "taskType": "ProcessDotMintFromPolka",
  //    "fee": fees.mintFeeBN
  //};
  async process(paramsJson, wallet) {
    let WebStores = this.m_frameworkService.getService("WebStores");
    let polkadotService = this.m_frameworkService.getService("PolkadotService");
    //console.debug("ProcessDotMintFromPolka paramsJson:", paramsJson);
    let params = paramsJson.params;
    try {
      let tokenPairId = parseInt(params.tokenPairID);
      //console.debug("typeof params.fee:", typeof params.fee, "fee:", params.fee);
      let memo = await wallet.buildUserLockMemo(tokenPairId, params.userAccount, params.fee.toString(16));
      console.debug("ProcessDotMintFromPolka memo:", memo);

      if (typeof params.value === "string") {
        params.value = new BigNumber(params.value);
      }
      if (typeof params.fee === "string") {
        params.fee = new BigNumber(params.fee);
      }
      //console.log("DOT value:", params.value, "fee:", params.fee);
      //console.log("DOT value:", params.value.toString(), "fee:", params.fee.toString());

      let api = await polkadotService.getApi();

      // 1 根据storemanGroupPublicKey 生成storemanGroup的DOT地址
      //console.log("params.fromAddr:", params.fromAddr);
      let storemanGroupAddr = await polkadotService.longPubKeyToAddress(params.storemanGroupGpk);
      //console.log("storemanGroupAddr:", storemanGroupAddr);

      // 2 生成交易串
      let totalTransferValue = params.value;
      //totalTransferValue = totalTransferValue.plus(params.fee);
      console.debug("totalTransferValue:", totalTransferValue, ",", totalTransferValue.toNumber());
      totalTransferValue = "0x" + totalTransferValue.toString(16);
      let txs = [
        api.tx.system.remark(memo),
        api.tx.balances.transferKeepAlive(storemanGroupAddr, totalTransferValue)
      ];
      // console.log("txs:", txs);
      // 3 计算交易费用
      let estimateFee = await polkadotService.estimateFee(params.fromAddr, txs);

      // 4 校验:balance >= (value + fee + estimateFee + minReserved)
      let balance = await polkadotService.getBalance(params.fromAddr);
      let bnBalance = new BigNumber(balance);

      let totalNeed = params.value;
      totalNeed = totalNeed.plus(params.fee);
      totalNeed = totalNeed.plus(estimateFee);

      let chainInfoService = this.m_frameworkService.getService("ChainInfoService");
      let chainInfo = await chainInfoService.getChainInfoByType("DOT");
      let pows = new BigNumber(Math.pow(10, chainInfo.chainDecimals));
      let minReserved = new BigNumber(chainInfo.minReserved);
      minReserved = minReserved.multipliedBy(pows);
      totalNeed = totalNeed.plus(minReserved);

      //console.log("balance:", balance, ",", balance.toNumber());
      //console.log("processDOT value:", params.value, ",", params.value.toNumber());
      //console.log("processDOT fee:", params.fee, ",", params.fee.toNumber());
      //console.log("processDOT estimateFee:", estimateFee, ",", estimateFee.toNumber());
      //console.log("processDOT minReserved:", minReserved, ",", minReserved.toNumber());
      //console.log("processDOT totalNeed:", totalNeed, ",", totalNeed.toNumber());
      if (bnBalance.isLessThan(totalNeed)) {
        console.error("insufficient balance");
        WebStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, paramsJson.stepIndex, "", "Failed");
        return;
      }

      // 5 签名并发送
      let txHash;
      try {
        txHash = await wallet.sendTransaction(txs, params.fromAddr);
      }
      catch (err) {
        if (err.message === "Cancelled") {
          console.log("dot mask Cancelled");
          WebStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, paramsJson.stepIndex, err.message, "Rejected");
        }
        else {
          console.log("dot mask unknown error");
          WebStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, paramsJson.stepIndex, err.message, "Failed");
        }
        return;
      }
      paramsJson.txhash = txHash;

      // 查询目的链当前blockNumber
      let iwan = this.m_frameworkService.getService("iWanConnectorService");
      let blockNumber = await iwan.getBlockNumber(params.toChainType);
      let checkPara = {
        ccTaskId: params.ccTaskId,
        fromBlockNumber: blockNumber,
        txHash: txHash,
        chain: params.toChainType,
        smgPublicKey: params.storemanGroupGpk,
        taskType: "MINT"
      };

      let checkDotTxService = this.m_frameworkService.getService("CheckDotTxService");
      await checkDotTxService.addDotInfo(checkPara);
      WebStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, paramsJson.stepIndex, txHash, "Succeeded");
      return;
    }
    catch (err) {
      console.log("ProcessDotMintFromPolka process err:", err);
      WebStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, paramsJson.stepIndex, err.message, "Failed");
    }
  }
};
