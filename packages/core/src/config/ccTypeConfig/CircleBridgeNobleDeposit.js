'use strict';

const BigNumber = require("bignumber.js");
const tool = require("../../utils/tool.js");

module.exports = class CircleBridgeNobleDeposit {
  constructor(frameworkService) {
    this.frameworkService = frameworkService;
    this.configService = frameworkService.getService("ConfigService");
  }

  async process(tokenPair, convert) {
    try {
      let value = new BigNumber(convert.value).multipliedBy(Math.pow(10, tokenPair.toDecimals)).toFixed(0);
      let networkFee = tool.parseFee(convert.fee, convert.value, "USDC", {formatWithDecimals: false, feeType: "networkFee"});
      let chainInfo = (convert.convertType === "MINT")? tokenPair.fromScInfo : tokenPair.toScInfo;
      let toChainType = (convert.convertType === "MINT")? tokenPair.toChainType : tokenPair.fromChainType;
      let toAddressInfo = tool.getStandardAddressInfo(toChainType, convert.toAddr, this.configService.getExtension(toChainType));
      let params = {
        ccTaskId: convert.ccTaskId,
        toChainType,
        feeHolder: chainInfo.feeHolder,
        userAccount: toAddressInfo.cctp || toAddressInfo.evm,
        toAddr: convert.toAddr, // for readability
        tokenPairID: convert.tokenPairId,
        value,
        taskType: "ProcessCircleBridgeNobleDeposit",
        networkFee,
        fromAddr: convert.fromAddr
      };
      console.debug("CircleBridgeNobleDeposit params: %O", params);
      let steps = [
        {name: "userFastBurn", stepIndex: 1, title: "BurnTitle", desc: "BurnDesc", params}
      ];
      return steps;
    } catch (err) {
      console.error("CircleBridgeNobleDeposit error: %O", err);
      throw err;
    }
  }
};