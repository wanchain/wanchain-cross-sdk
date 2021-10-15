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
      // console.debug("%s tokenPair: %O", handleName, tokenPair);
      // console.debug("%s convertJson: %O", handleName, convertJson);
      let value = new BigNumber(convertJson.value).multipliedBy(Math.pow(10, tokenPair.fromDecimals));
      let params = {
        ccTaskId: convertJson.ccTaskId,
        fromChainType: tokenPair.fromChainType,
        toChainType: tokenPair.toChainType,
        userAccount: convertJson.toAddr,
        storemanGroupId: convertJson.storemanGroupId,
        storemanGroupGpk: convertJson.storemanGroupGpk,
        tokenPairID: convertJson.tokenPairId,
        value: value,
        taskType: "ProcessMintBtcFromBitcoin",
        fee: convertJson.fee.operateFee.value, // not used
        networkFee: convertJson.fee.networkFee.value
      };
      console.debug("%s params: %O", handleName, params);
      let ret = [
        {name: "userFastMint", stepIndex: 1, title: "MintTitle", desc: "MintDesc", params}
      ];
      WebStores["crossChainTaskSteps"].setTaskSteps(convertJson.ccTaskId, ret);
      return {
        stepNum: ret.length,
        errCode: null
      };
    } catch (err) {
      console.error("%s error: %O", handleName, err);
      WebStores["crossChainTaskSteps"].setTaskSteps(convertJson.ccTaskId, []);
      return {
        stepNum: 0,
        errCode: err
      };
    }
  }
};
