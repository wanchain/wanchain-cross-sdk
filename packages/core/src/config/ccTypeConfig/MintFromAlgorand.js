'use strict';

const BigNumber = require("bignumber.js");
const tool = require("../../utils/tool.js");

module.exports = class MintFromAlgorand {
  constructor(frameworkService) {
    this.frameworkService = frameworkService;
    this.configService = frameworkService.getService("ConfigService");
  }

  async process(tokenPair, convert) {
    try {
      let direction = (convert.convertType === "MINT");
      let chainInfo = direction? tokenPair.fromScInfo : tokenPair.toScInfo;
      let decimals = direction? tokenPair.fromDecimals : tokenPair.toDecimals;
      let toChainType = direction? tokenPair.toChainType : tokenPair.fromChainType;
      let value = new BigNumber(convert.value).multipliedBy(Math.pow(10, decimals)).toFixed(0);
      let networkFee = tool.parseFee(convert.fee, convert.value, "ALGO", {formatWithDecimals: false, feeType: "networkFee"});
      let params = {
        ccTaskId: convert.ccTaskId,
        toChainType,
        crossScId: chainInfo.crossScAddr,
        userAccount: tool.getStandardAddressInfo(toChainType, convert.toAddr, this.configService.getExtension(toChainType)).ascii,
        toAddr: convert.toAddr, // for readability
        storemanGroupId: convert.storemanGroupId,
        storemanGroupGpk: convert.gpkInfo.gpk,
        tokenPairID: convert.tokenPairId,
        value,
        taskType: "ProcessMintFromAlgorand",
        networkFee,
        fromAddr: convert.fromAddr
      };
      console.debug("Mint %s FromAlgorand params: %O", tokenPair.readableSymbol, params);
      let steps = [
        {name: "userFastMint", stepIndex: 1, title: "MintTitle", desc: "MintDesc", params}
      ];
      return steps;
    } catch (err) {
      console.error("Mint %s FromAlgorand error: %O", tokenPair.readableSymbol, err);
      throw err;
    }
  }
};