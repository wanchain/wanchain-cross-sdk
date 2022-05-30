'use strict';

let BigNumber = require("bignumber.js");

module.exports = class MintDotFromPolkaHandle {
  constructor(frameworkService) {
    this.m_frameworkService = frameworkService;
  }

  async process(tokenPairObj, convertJson) {
    let WebStores = this.m_frameworkService.getService("WebStores");
    try {
      let value = new BigNumber(convertJson.value).multipliedBy(Math.pow(10, tokenPairObj.fromDecimals)).toFixed();
      let params = {
        ccTaskId: convertJson.ccTaskId,
        toChainType: tokenPairObj.toChainType,
        userAccount: convertJson.toAddr,
        storemanGroupId: convertJson.storemanGroupId,
        storemanGroupGpk: convertJson.storemanGroupGpk,
        tokenPairID: convertJson.tokenPairId,
        value,
        taskType: "ProcessDotMintFromPolka",
        fee: convertJson.fee.operateFee.rawValue,
        networkFee: convertJson.fee.networkFee.rawValue, // not used
        fromAddr: convertJson.fromAddr
      };
      console.debug("MintDotFromPolkaHandle params: %O", params);
      let ret = [
        {name: "userFastMint", stepIndex: 1, title: "MintTitle", desc: "MintDesc", params}
      ];
      WebStores["crossChainTaskSteps"].setTaskSteps(convertJson.ccTaskId, ret);
      return {
        stepNum: ret.length,
        errCode: null
      };
    } catch (err) {
      console.error("MintDotFromPolkaHandle error: %O", err);
      WebStores["crossChainTaskSteps"].setTaskSteps(convertJson.ccTaskId, []);
      return {
        stepNum: 0,
        errCode: err
      };
    }
  }
};