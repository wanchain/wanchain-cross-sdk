'use strict';

const BigNumber = require("bignumber.js");
const tool = require('../../utils/tool.js');

module.exports = class MintXrpFromRipple {
  constructor(frameworkService) {
    this.frameworkService = frameworkService;
    this.configService = frameworkService.getService("ConfigService");
  }

  async process(tokenPair, convert) {
    try {
      let value = new BigNumber(convert.value);
      if (tokenPair.fromAccount == 0) { // token ignore decimals
        value = value.multipliedBy(Math.pow(10, tokenPair.fromDecimals));
      }
      value = value.toFixed();
      // neither apiServer nor storeman agent adopt the fee, they get fee from iwan or config contract,
      // so do not distinguish networkFee and operateFee, and ignore returned fee value of apiServer
      let fee = tool.parseFee(convert.fee, convert.value, tokenPair.readableSymbol);
      let toChainType = tokenPair.toChainType;
      let params = {
        ccTaskId: convert.ccTaskId,
        toChainType,
        userAccount: tool.getStandardAddressInfo(toChainType, convert.toAddr, this.configService.getExtension(toChainType)).evm,
        toAddr: convert.toAddr, // for readability
        storemanGroupId: convert.storemanGroupId,
        storemanGroupGpk: convert.gpkInfo.gpk,
        tokenPairID: convert.tokenPairId,
        value,
        taskType: "ProcessXrpMintFromRipple",
        fee
      };
      console.debug("Mint %s FromRipple params: %O", tokenPair.readableSymbol, params);
      let steps = [
        {name: "addTag", stepIndex: 1, title: "MintTitle", desc: "MintDesc", params}
      ];
      return steps;
    } catch (err) {
      console.error("Mint %s FromRipple error: %O", tokenPair.readableSymbol, err);
      throw err;
    }
  }
};
