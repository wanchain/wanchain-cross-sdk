'use strict';

const BigNumber = require("bignumber.js");
const tool = require("../../utils/tool.js");

module.exports = class MintAdaFromCardano {
  constructor(frameworkService) {
    this.frameworkService = frameworkService;
    this.configService = frameworkService.getService("ConfigService");
  }

  async process(tokenPair, convert) {
    try {
      let value = new BigNumber(convert.value).multipliedBy(Math.pow(10, tokenPair.fromDecimals)).toFixed(0);
      // fee is not necessary, storeman agent get fee from config contract
      let fee = tool.parseFee(convert.fee, convert.value, tokenPair.readableSymbol, {formatWithDecimals: false});
      let toChainType = tokenPair.toChainType;
      let params = {
        ccTaskId: convert.ccTaskId,
        toChainType,
        crossScAddr: tokenPair.fromScInfo.crossScAddr,
        userAccount: tool.getStandardAddressInfo(toChainType, convert.toAddr, this.configService.getExtension(toChainType)).ascii,
        toAddr: convert.toAddr, // for readability
        storemanGroupId: convert.storemanGroupId,
        storemanGroupGpk: convert.gpkInfo.gpk,
        tokenPairID: convert.tokenPairId,
        value,
        taskType: "ProcessAdaMintFromCardano",
        fee,
        fromAddr: convert.fromAddr
      };
      console.debug("Mint %s FromCardano params: %O", tokenPair.readableSymbol, params);
      let steps = [
        {name: "userFastMint", stepIndex: 1, title: "MintTitle", desc: "MintDesc", params}
      ];
      return steps;
    } catch (err) {
      console.error("Mint %s FromCardano error: %O", tokenPair.readableSymbol, err);
      throw err;
    }
  }
};