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
      let value = new BigNumber(convert.value);
      if (tokenPair.fromAccount == 0) { // token ignore decimals
        value = value.multipliedBy(Math.pow(10, tokenPair.fromDecimals));
      }
      value = value.toFixed();
      // neither apiServer nor storeman agent adopt the fee, the get fee from iwan or config contract,
      // so do not distinguish networkFee and operateFee, and ignore returned fee value of apiServer
      let fee = tool.parseFee(convert.fee, convert.value, tool.parseTokenPairSymbol("XRP", tokenPair.ancestorSymbol));
      let params = {
        ccTaskId: convert.ccTaskId,
        toChainType: tokenPair.toChainType,
        userAccount: tool.getStandardAddressInfo(tokenPair.toChainType, convert.toAddr).evm,
        toAddr: convert.toAddr, // for readability
        storemanGroupId: convert.storemanGroupId,
        storemanGroupGpk: convert.storemanGroupGpk,
        tokenPairID: convert.tokenPairId,
        value,
        taskType: "ProcessXrpMintFromRipple",
        fee
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
