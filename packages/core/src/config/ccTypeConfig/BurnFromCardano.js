'use strict';

const BigNumber = require("bignumber.js");
const tool = require("../../utils/tool.js");

module.exports = class BurnFromCardano {
  constructor(frameworkService) {
    this.frameworkService = frameworkService;
  }

  async process(tokenPair, convert) {
    let webStores = this.frameworkService.getService("WebStores");
    try {
      let value = new BigNumber(convert.value).multipliedBy(Math.pow(10, tokenPair.toDecimals)).toFixed(0);
      // fee is not necessary, storeman agent get fee from config contract
      let fee = tool.parseFee(convert.fee, convert.value, tokenPair.readableSymbol, {formatWithDecimals: false});
      let params = {
        ccTaskId: convert.ccTaskId,
        toChainType: tokenPair.fromChainType,
        crossScAddr: tokenPair.toScInfo.crossScAddr,
        userAccount: convert.toAddr,
        storemanGroupId: convert.storemanGroupId,
        storemanGroupGpk: convert.storemanGroupGpk,
        tokenPairID: convert.tokenPairId,
        value,
        taskType: "ProcessBurnFromCardano",
        fee,
        fromAddr: convert.fromAddr
      };
      console.debug("Burn %s FromCardano params: %O", tokenPair.readableSymbol, params);
      let ret = [
        {name: "userFastBurn", stepIndex: 1, title: "BurnTitle", desc: "BurnDesc", params}
      ];
      webStores["crossChainTaskSteps"].setTaskSteps(convert.ccTaskId, ret);
      return {
        stepNum: ret.length,
        errCode: null
      };
    } catch (err) {
      console.error("Burn %s FromCardano error: %O", tokenPair.readableSymbol, err);
      webStores["crossChainTaskSteps"].setTaskSteps(convert.ccTaskId, []);
      return {
        stepNum: 0,
        errCode: err
      };
    }
  }
};