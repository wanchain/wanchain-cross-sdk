'use strict';

const BigNumber = require("bignumber.js");
const tool = require("../../utils/tool.js");

module.exports = class CircleBridgeSuiDeposit {
  constructor(frameworkService) {
    this.frameworkService = frameworkService;
    this.configService = frameworkService.getService("ConfigService");
  }

  async process(tokenPair, convert) {
    try {
      let direction = (convert.convertType === "MINT");
      let chainInfo = direction? tokenPair.fromScInfo : tokenPair.toScInfo;
      let decimals = direction? tokenPair.fromDecimals : tokenPair.toDecimals;
      let value = new BigNumber(convert.value).multipliedBy(Math.pow(10, decimals)).toFixed(0);
      let networkFee = tool.parseFee(convert.fee, convert.value, "SUI", {formatWithDecimals: false, feeType: "networkFee"});
      let toChainType = direction? tokenPair.toChainType : tokenPair.fromChainType;
      let toAddressInfo = tool.getStandardAddressInfo(toChainType, convert.toAddr, this.configService.getExtension(toChainType));
      let params = {
        ccTaskId: convert.ccTaskId,
        toChainType,
        userAccount: toAddressInfo.cctp || toAddressInfo.evm,
        toAddr: convert.toAddr, // for readability
        tokenPairID: convert.tokenPairId,
        value,
        taskType: "ProcessCircleBridgeSuiDeposit",
        networkFee,
        fromAddr: convert.fromAddr
      };
      console.debug("CircleBridgeSuiDeposit params: %O", params);
      let steps = [
        {name: "userFastBurn", stepIndex: 1, title: "BurnTitle", desc: "BurnDesc", params}
      ];
      return steps;
    } catch (err) {
      console.error("CircleBridgeSuiDeposit error: %O", err);
      throw err;
    }
  }
};