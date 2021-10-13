'use strict';

let BigNumber = require("bignumber.js");

const handleNames = {
  BTC: "MintBtcFromBitcoinHandle",
  LTC: "MintLtcFromLitecoinHandle",
  DOGE: "MintDogeFromDogecoinHandle"
};

module.exports = class MintBtcFromBitcoinHandle {
  constructor(frameworkService) {
    this.m_frameworkService = frameworkService;
  }

  async process(tokenPair, convertJson) {
    let WebStores = this.m_frameworkService.getService("WebStores");
    let handleName = handleNames[tokenPair.fromChainType];

    try {
      console.log("%s tokenPair: %O", handleName, tokenPair);
      console.log("%s convertJson: %O", handleName, convertJson);
      let decimals = Number(tokenPair.fromDecimals);
      let value = new BigNumber(convertJson.value);
      let pows = new BigNumber(Math.pow(10, decimals));
      value = value.multipliedBy(pows);

      let crossChainFeesService = this.m_frameworkService.getService("CrossChainFeesService");
      let fees = await crossChainFeesService.getServcieFees(tokenPair.id, "MINT");
      let networkFee = await crossChainFeesService.estimateNetworkFee(tokenPair.id, "MINT");
      console.log("%s fee: %O", handleName, {fees, networkFee});

      let userFastMintParaJson = {
        "ccTaskId": convertJson.ccTaskId,
        "fromChainType": tokenPair.fromChainType,
        "toChainType": tokenPair.toChainType,
        "userAccount": convertJson.toAddr,
        "storemanGroupId": convertJson.storemanGroupId,
        "storemanGroupGpk": convertJson.storemanGroupGpk,
        "tokenPairID": convertJson.tokenPairId,
        "value": value,
        "taskType": "ProcessMintBtcFromBitcoin",
        "fee": fees.mintFeeBN,
        "networkFee": networkFee.fee,
        "webNeedToken": true
      };
      console.log("userFastMintParaJson:", userFastMintParaJson);

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
      console.log("%s err: %O", handleName, err);
      WebStores["crossChainTaskSteps"].setTaskSteps(convertJson.ccTaskId, []);
      return {
        stepNum: 0,
        errCode: err
      };
    }
  }
};
