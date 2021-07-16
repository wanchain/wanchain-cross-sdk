'use strict';

let BigNumber = require("bignumber.js");

module.exports = class MintDotFromPolkaHandle {
  constructor(frameworkService) {
    this.m_frameworkService = frameworkService;
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
  //     convertType: undefined, // the value is "MINT" or "BURN", used by web server 
  //};
  async process(tokenPairObj, convertJson) {
    let globalConstant = this.m_frameworkService.getService("GlobalConstant");

    let WebStores = this.m_frameworkService.getService("WebStores");
    try {
      let decimals = Number(tokenPairObj.fromDecimals);
      let value = new BigNumber(convertJson.value);
      let pows = new BigNumber(Math.pow(10, decimals));
      value = value.multipliedBy(pows);

      let crossChainFeesService = this.m_frameworkService.getService("CrossChainFeesService");
      let fees = await crossChainFeesService.getServcieFees(tokenPairObj.id, "MINT");
      let networkFee = await crossChainFeesService.estimateNetworkFee(tokenPairObj.id, "MINT");
      //console.log("MintDotFromPolkaHandle fee:", fees, networkFee);
      let userFastMintParaJson = {
        "ccTaskId": convertJson.ccTaskId,
        "toChainType": tokenPairObj.toChainType,
        "userAccount": convertJson.toAddr,
        "storemanGroupId": convertJson.storemanGroupId,
        "storemanGroupGpk": convertJson.storemanGroupGpk,
        "tokenPairID": convertJson.tokenPairId,
        "value": value,
        "taskType": "ProcessDotMintFromPolka",
        "fee": fees.mintFeeBN,
        "networkFee": networkFee.fee,
        "webNeedToken": true,
        "fromAddr": convertJson.fromAddr
      };
      //console.log("MintDotFromPolkaHandle userFastMintParaJson:", userFastMintParaJson);
      let ret = [
        { "name": "userFastMint", "stepIndex": 1, "title": "MintTitle", "desc": "MintDesc", "params": userFastMintParaJson }
      ];
      WebStores["crossChainTaskSteps"].setTaskSteps(convertJson.ccTaskId, ret);
      return {
        stepNum: ret.length,
        errCode: null
      };
    }
    catch (err) {
      console.log("MintDotFromPolkaHandle err:", err);
      WebStores["crossChainTaskSteps"].setTaskSteps(convertJson.ccTaskId, []);
      return {
        stepNum: 0,
        errCode: globalConstant.ERR_OTHER_UNKNOWN_ERR
      };
    }
  }
};

//{
//  id: '30',
//  fromChainID: '2147484002',
//  fromAccount: '0x0000000000000000000000000000000000000000',
//  toChainID: '2153201998',
//  toAccount: '0xafec1dbd8db90398cc710d3cb8006a08f5828696',
//  ancestorSymbol: 'WND',
//  ancestorDecimals: '12',
//  ancestorAccount: '0x0000000000000000000000000000000000000000',
//  ancestorName: 'polkaTestnet',
//  ancestorChainID: '2147484002',
//  name: 'wanWND@wanchain',
//  symbol: 'wanWND',
//  decimals: '12',
//  fromChainType: 'DOT',
//  fromChainName: 'polkaTestnet',
//  fromSymbol: 'WND@polkaTestnet',
//  fromDecimals: '12',
//  toChainType: 'WAN',
//  toChainName: 'Wanchain',
//  toSymbol: 'wanWND@Wanchain',
//  toDecimals: '12',
//  storemangroupList: [[Object], [Object], [Object]]
//},

