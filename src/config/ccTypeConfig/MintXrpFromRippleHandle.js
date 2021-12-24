'use strict';

const BigNumber = require("bignumber.js");
const tool = require('../../utils/tool.js');

module.exports = class MintXrpFromRipple {
  constructor(frameworkService) {
    this.m_frameworkService = frameworkService;
  }

  async process(tokenPair, convert) {
    let WebStores = this.m_frameworkService.getService("WebStores");
    try {
      let value = new BigNumber(convert.value).multipliedBy(Math.pow(10, tokenPair.decimals)).toFixed();
      let networkFee = tool.parseFee(convert.fee, convert.value, tokenPair.ancestorSymbol, tokenPair.decimals);
      let params = {
        ccTaskId: convert.ccTaskId,
        toChainType: tokenPair.toChainType,
        userAccount: convert.toAddr,
        storemanGroupId: convert.storemanGroupId,
        storemanGroupGpk: convert.storemanGroupGpk,
        tokenPairID: convert.tokenPairId,
        value,
        taskType: "ProcessXrpMintFromRipple",
        networkFee
      };
      console.debug("MintXrpFromRipple params: %O", params);
      let ret = [
        {name: "userFastMint", stepIndex: 1, title: "MintTitle", desc: "MintDesc", params}
      ];
      WebStores["crossChainTaskSteps"].setTaskSteps(convert.ccTaskId, ret);
      return {
        stepNum: ret.length,
        errCode: null
      };
    } catch (err) {
      console.error("MintXrpFromRipple error: %O", err);
      WebStores["crossChainTaskSteps"].setTaskSteps(convert.ccTaskId, []);
      return {
        stepNum: 0,
        errCode: err
      };
    }
  }
};
