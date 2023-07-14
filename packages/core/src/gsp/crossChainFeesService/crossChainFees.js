'use strict';

const BigNumber = require("bignumber.js");
const tool = require('../../utils/tool.js');

module.exports = class crossChainFees {
  async init(frameworkService) {
    let cofigService = frameworkService.getService("ConfigService");
    this.subsidyAbi = cofigService.getAbi("subsidyCrossSc");
    this.iwan = frameworkService.getService("iWanConnectorService");
    this.tokenPairService = frameworkService.getService("TokenPairService");
  }

  // agent fee
  async estimateOperationFee(tokenPairId, fromChainType, toChainType, options) {
    let tokenPair = this.tokenPairService.getTokenPair(tokenPairId);
    let decimals = (fromChainType === tokenPair.fromScInfo.chainType)? tokenPair.fromDecimals : tokenPair.toDecimals;
    let fee = await this.iwan.estimateCrossChainOperationFee(fromChainType, toChainType, {tokenPairID: tokenPairId, address: options.address || ""});
    if (tokenPair.protocol !== "Erc20") {
      fee.value = "0";
    }
    // console.debug("estimateOperationFee %s->%s raw: %O", fromChainType, toChainType, fee);
    let feeBN = new BigNumber(fee.value);
    return {
      fee: fee.isPercent? feeBN.toFixed() : feeBN.div(Math.pow(10, decimals)).toFixed(),
      isRatio: fee.isPercent,
      unit: tokenPair.readableSymbol,
      min: new BigNumber(fee.minFeeLimit || "0").div(Math.pow(10, decimals)).toFixed(),
      max: new BigNumber(fee.maxFeeLimit || "0").div(Math.pow(10, decimals)).toFixed(),
      decimals: Number(decimals),
      discount: fee.discountPercent || "1"
    };
  }

  // contract fee
  async estimateNetworkFee(tokenPairId, fromChainType, toChainType, options) {
    let tokenPair = this.tokenPairService.getTokenPair(tokenPairId);
    let direction = (fromChainType === tokenPair.fromScInfo.chainType);
    let srcChainInfo = direction? tokenPair.fromScInfo : tokenPair.toScInfo;
    let decimals = srcChainInfo.chainDecimals;
    let fee = await this.iwan.estimateCrossChainNetworkFee(fromChainType, toChainType, {tokenPairID: tokenPairId, address: options.address || "", batchSize: options.batchSize});
    // console.debug("estimateNetworkFee %s->%s raw: %O", fromChainType, toChainType, fee);
    let feeBN = new BigNumber(fee.value);
    // ETH maybe has different symbos on layer2 chains, it leads networkFee unit problem, should use ancestorSymbol as unit
    let unit, tokenAccount = direction? tokenPair.fromAccount : tokenPair.toAccount;
    if (tokenAccount === "0x0000000000000000000000000000000000000000") { // coin
      unit = tokenPair.ancestorSymbol;
    } else {
      unit = tool.getCoinSymbol(fromChainType, srcChainInfo.chainName);
    }
    // check subsidy
    let isSubsidy = false;
    if (srcChainInfo.subsidyCrossSc) {
      let destChainInfo = direction? tokenPair.toScInfo : tokenPair.fromScInfo;
      let args = [srcChainInfo.chainId, destChainInfo.chainId];
      isSubsidy = await this.iwan.callScFunc(srcChainInfo.chainType, srcChainInfo.subsidyCrossSc, "subsidized", args, this.subsidyAbi);
    }
    return {
      fee: fee.isPercent? feeBN.toFixed() : feeBN.div(Math.pow(10, decimals)).toFixed(),
      isRatio: fee.isPercent,
      unit,
      min: new BigNumber(fee.minFeeLimit || "0").div(Math.pow(10, decimals)).toFixed(),
      max: new BigNumber(fee.maxFeeLimit || "0").div(Math.pow(10, decimals)).toFixed(),
      decimals: Number(decimals),
      discount: fee.discountPercent || "1",
      isSubsidy,
    };
  }
};