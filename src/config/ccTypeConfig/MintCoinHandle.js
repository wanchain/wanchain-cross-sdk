'use strict';

let BigNumber = require("bignumber.js");

module.exports = class MintCoinHandle {
  constructor(frameworkService) {
    this.m_frameworkService = frameworkService;
    this.m_WebStores = frameworkService.getService("WebStores");
    this.m_taskService = frameworkService.getService("TaskService");
    this.m_iwanBCConnector = frameworkService.getService("iWanConnectorService");
  }

  // data example
  //    let convertJson = {
  //    "tokenPairId": "3",
  //    "fromName": "LINK",
  //    "toName": "wanLINK@Wanchain",
  //    "storemanGroupId": "1",
  //    "toAddr": "0xB2d91924382e8e11065fe47C96D9500B95013F7a",
  //    "fromAddr": "0x406b41140149f85e2d91d4daf7af8314c6c1437c",
  //    "value": 123,
  //    "ccTaskId": "ccTaskId",
  //     convertType: "", // the value is "MINT" or "BURN", used by web server 
  //};
  async process(tokenPairObj, convertJson) {
    let globalConstant = this.m_frameworkService.getService("GlobalConstant");

    this.m_uiStrService = this.m_frameworkService.getService("UIStrService");
    this.m_strMintTitle = this.m_uiStrService.getStrByName("MintTitle");
    this.m_strMintDesc = this.m_uiStrService.getStrByName("MintDesc");

    // COIN MINT
    let decimals = Number(tokenPairObj.fromDecimals);
    let value = new BigNumber(convertJson.value);
    let pows = new BigNumber(Math.pow(10, decimals));
    value = value.multipliedBy(pows);
    let balance = await this.m_iwanBCConnector.getBalance(tokenPairObj.fromChainType, convertJson.fromAddr);
    balance = new BigNumber(balance);
    let gas = new BigNumber(tokenPairObj.fromScInfo.coinFastMintGasLimit);
    let gas_value = gas.plus(value);

    let crossChainFeesService = this.m_frameworkService.getService("CrossChainFeesService");
    let fees = await crossChainFeesService.getServcieFees(tokenPairObj.id, "MINT");
    gas_value = gas_value.plus(fees.mintFeeBN);

    //console.log("mint coin value:", value.toString(), ",typeof value:", typeof value);
    //console.log("mint coin balance:", balance.toString(), ",typeof balance:", typeof balance);
    //console.log("mint coin gas_value:", gas_value.toString(), ",typeof gas_value:", typeof gas_value);
    if (balance.isLessThan(gas_value)) {
      console.log("MintCoinHandle balance:", balance, " <= gas_value:", gas_value);
      this.m_WebStores["crossChainTaskSteps"].setTaskSteps(convertJson.ccTaskId, []);
      return {
        stepNum: 0,
        errCode: globalConstant.ERR_INSUFFICIENT_GAS
      };
    }

    let userFastMintParaJson = {
      "ccTaskId": convertJson.ccTaskId,
      "fromAddr": convertJson.fromAddr,
      "scChainType": tokenPairObj.fromChainType,
      "crossScAddr": tokenPairObj.fromScInfo.crossScAddr,
      "crossScAbi": tokenPairObj.fromScInfo.crossScAbiJson,
      "gasPrice": tokenPairObj.fromScInfo.gasPrice,
      "gasLimit": tokenPairObj.fromScInfo.coinFastMintGasLimit,
      "storemanGroupId": convertJson.storemanGroupId,
      "tokenPairID": convertJson.tokenPairId,
      "value": value,
      "userAccount": convertJson.toAddr,
      "taskType": "ProcessCoinUserFastMint",
      "fee": fees.mintFeeBN
    };

    let accountService = await this.m_frameworkService.getService("AccountService");
    userFastMintParaJson.chainId = await accountService.getChainId(userFastMintParaJson.scChainType);

    let ret = [
      { "name": "userFastMint", "stepIndex": 1, "title": this.m_strMintTitle, "desc": this.m_strMintDesc, "params": userFastMintParaJson }
    ];
    this.m_WebStores["crossChainTaskSteps"].setTaskSteps(convertJson.ccTaskId, ret);
    //console.log("MintCoinHandle ret:", ret);
    return {
      stepNum: ret.length,
      errCode: null
    };
  }
};
