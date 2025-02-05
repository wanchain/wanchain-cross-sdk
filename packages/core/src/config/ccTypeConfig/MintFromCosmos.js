'use strict';

const BigNumber = require("bignumber.js");
const tool = require("../../utils/tool.js");

module.exports = class MintFromCosmos {
  constructor(frameworkService) {
    this.frameworkService = frameworkService;
    this.configService = frameworkService.getService("ConfigService");
  }

  async process(tokenPair, convert) {
    let direction = (convert.convertType === "MINT");
    let fromChainType = direction? tokenPair.fromChainType : tokenPair.toChainType;
    let toChainType = direction? tokenPair.toChainType : tokenPair.fromChainType;
    let decimals = direction? tokenPair.fromDecimals : tokenPair.toDecimals;
    let chainInfo = direction? tokenPair.fromScInfo : tokenPair.toScInfo;
    try {
      let value = new BigNumber(convert.value).multipliedBy(Math.pow(10, decimals)).toFixed(0);
      let networkFee = tool.parseFee(convert.fee, convert.value, (chainInfo.symbol || fromChainType), {formatWithDecimals: false, feeType: "networkFee"});
      let params = {
        ccTaskId: convert.ccTaskId,
        fromChainType,
        toChainType,
        userAccount: tool.getStandardAddressInfo(toChainType, convert.toAddr, this.configService.getExtension(toChainType)).ascii,
        toAddr: convert.toAddr, // for readability
        storemanGroupId: convert.storemanGroupId,
        storemanGroupGpk: convert.gpkInfo.gpk,
        tokenPairID: convert.tokenPairId,
        value,
        taskType: "ProcessMintFromCosmos",
        networkFee,
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