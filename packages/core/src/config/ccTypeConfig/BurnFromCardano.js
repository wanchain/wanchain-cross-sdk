'use strict';

const BigNumber = require("bignumber.js");
const tool = require("../../utils/tool.js");

module.exports = class BurnFromCardano {
  constructor(frameworkService) {
    this.frameworkService = frameworkService;
    this.configService = frameworkService.getService("ConfigService");
  }

  async process(tokenPair, convert) {
    try {
      let value = new BigNumber(convert.value).multipliedBy(Math.pow(10, tokenPair.toDecimals)).toFixed(0);
      // fee is not necessary, storeman agent get fee from config contract
      let fee = tool.parseFee(convert.fee, convert.value, tokenPair.readableSymbol, {formatWithDecimals: false});
      let toChainType = tokenPair.fromChainType;
      let params = {
        ccTaskId: convert.ccTaskId,
        toChainType,
        crossScAddr: tokenPair.toScInfo.crossScAddr,
        userAccount: tool.getStandardAddressInfo(toChainType, convert.toAddr, this.configService.getExtension(toChainType)).ascii,
        toAddr: convert.toAddr, // for readability
        storemanGroupId: convert.storemanGroupId,
        storemanGroupGpk: convert.gpkInfo.gpk,
        tokenPairID: convert.tokenPairId,
        value,
        taskType: "ProcessBurnFromCardano",
        fee,
        fromAddr: convert.fromAddr
      };
      console.debug("Burn %s FromCardano params: %O", tokenPair.readableSymbol, params);
      let steps = [
        {name: "userFastBurn", stepIndex: 1, title: "BurnTitle", desc: "BurnDesc", params}
      ];
      return steps;
    } catch (err) {
      console.error("Burn %s FromCardano error: %O", tokenPair.readableSymbol, err);
      throw err;
    }
  }
};