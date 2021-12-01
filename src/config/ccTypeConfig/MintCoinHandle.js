'use strict';

let BigNumber = require("bignumber.js");

module.exports = class MintCoinHandle {
  constructor(frameworkService) {
    this.m_frameworkService = frameworkService;
    this.m_WebStores = frameworkService.getService("WebStores");
    this.m_taskService = frameworkService.getService("TaskService");
    this.m_iwanBCConnector = frameworkService.getService("iWanConnectorService");
  }

  async process(tokenPairObj, convertJson) {
    this.m_uiStrService = this.m_frameworkService.getService("UIStrService");
    this.m_strMintTitle = this.m_uiStrService.getStrByName("MintTitle");
    this.m_strMintDesc = this.m_uiStrService.getStrByName("MintDesc");

    let value = new BigNumber(convertJson.value).multipliedBy(Math.pow(10, tokenPairObj.fromDecimals));
    let userFastMintParaJson = {
      "ccTaskId": convertJson.ccTaskId,
      "fromAddr": convertJson.fromAddr,
      "scChainType": tokenPairObj.fromChainType,
      "crossScAddr": tokenPairObj.fromScInfo.crossScAddr,
      "gasPrice": tokenPairObj.fromScInfo.gasPrice, // undefined, get from chain dynamiclly
      "gasLimit": tokenPairObj.fromScInfo.coinFastMintGasLimit,
      "storemanGroupId": convertJson.storemanGroupId,
      "tokenPairID": convertJson.tokenPairId,
      "value": value,
      "userAccount": convertJson.toAddr,
      "taskType": "ProcessCoinUserFastMint",
      "fee": convertJson.fee.operateFee.rawValue
    };
    console.debug("MintCoinHandle userFastMintParaJson params: %O", userFastMintParaJson);
    userFastMintParaJson.chainId = await convertJson.wallet.getChainId();
    let ret = [
      { "name": "userFastMint", "stepIndex": 1, "title": this.m_strMintTitle, "desc": this.m_strMintDesc, "params": userFastMintParaJson }
    ];
    this.m_WebStores["crossChainTaskSteps"].setTaskSteps(convertJson.ccTaskId, ret);
    return {
      stepNum: ret.length,
      errCode: null
    };
  }
};
