'use strict';

const BigNumber = require("bignumber.js");
const tool = require("../../utils/tool.js");

module.exports = class MintFromTon {
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
      let networkFee = tool.parseFee(convert.fee, convert.value, "TON", {formatWithDecimals: false, feeType: "networkFee"});
      let toChainType = direction? tokenPair.toChainType : tokenPair.fromChainType;
      let toAddressInfo = tool.getStandardAddressInfo(toChainType, convert.toAddr, this.configService.getExtension(toChainType));
      let params = {
        ccTaskId: convert.ccTaskId,
        crossScAddr: chainInfo.crossScAddr,
        toChainType,
        userAccount: toAddressInfo.evm,
        toAddr: convert.toAddr, // for readability
        storemanGroupId: convert.storemanGroupId,
        tokenPairID: convert.tokenPairId,
        value,
        taskType: "ProcessMintFromTon",
        networkFee,
        fromAddr: convert.fromAddr
      };
      console.debug("MintFromTon params: %O", params);
      let steps = [
        {name: "userFastMint", stepIndex: 1, params}
      ];
      return steps;
    } catch (err) {
      console.error("MintFromTon error: %O", err);
      throw err;
    }
  }
};