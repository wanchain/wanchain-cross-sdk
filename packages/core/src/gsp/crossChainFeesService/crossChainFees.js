import BigNumber from "bignumber.js";

export default (class crossChainFees {
  async init(frameworkService) {
    let configService = frameworkService.getService("ConfigService");
    this.subsidyAbi = configService.getAbi("subsidyCrossSc");
    this.iwan = frameworkService.getService("iWanConnectorService");
    this.tokenPairService = frameworkService.getService("TokenPairService");
    this.chainInfoService = frameworkService.getService("ChainInfoService");
  }
  // agent fee
  async estimateOperationFee(tokenPairId, fromChainType, toChainType, options) {
    let tokenPair = this.tokenPairService.getTokenPair(tokenPairId);
    let decimals = (fromChainType === tokenPair.fromScInfo.chainType) ? tokenPair.fromDecimals : tokenPair.toDecimals;
    let fee = await this.iwan.estimateCrossChainOperationFee(fromChainType, toChainType, { tokenPairID: tokenPairId, bridge: options.bridge, address: options.address });
    if ((tokenPair.protocol !== "Erc20") || ((tokenPair.bridge === "Circle") && (tokenPair.routes[0] === "CCTPV1"))) {
      fee.value = "0";
    }
    // console.debug("estimateOperationFee %s->%s raw: %O", fromChainType, toChainType, fee);
    let feeBN = new BigNumber(fee.value);
    return {
      fee: fee.isPercent ? feeBN.toFixed() : feeBN.div(Math.pow(10, decimals)).toFixed(),
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
    let srcChainInfo = direction ? tokenPair.fromScInfo : tokenPair.toScInfo;
    let decimals = srcChainInfo.chainDecimals;
    let fee = await this.iwan.estimateCrossChainNetworkFee(fromChainType, toChainType, { tokenPairID: tokenPairId, bridge: options.bridge, address: options.address, batchSize: options.batchSize });
    // console.debug("estimateNetworkFee %s->%s raw: %O", fromChainType, toChainType, fee);
    let feeBN = new BigNumber(fee.value);
    let unit = this.chainInfoService.getCoinSymbol(fromChainType);
    // check subsidy
    let isSubsidy = false;
    if (srcChainInfo.subsidyCrossSc && (!options.bridge)) {
      let destChainInfo = direction ? tokenPair.toScInfo : tokenPair.fromScInfo;
      let args = [srcChainInfo.chainId, destChainInfo.chainId];
      isSubsidy = await this.iwan.callScFunc(srcChainInfo.chainType, srcChainInfo.subsidyCrossSc, "subsidized", args, this.subsidyAbi);
    }
    return {
      fee: fee.isPercent ? feeBN.toFixed() : feeBN.div(Math.pow(10, decimals)).toFixed(),
      isRatio: fee.isPercent,
      unit,
      min: new BigNumber(fee.minFeeLimit || "0").div(Math.pow(10, decimals)).toFixed(),
      max: new BigNumber(fee.maxFeeLimit || "0").div(Math.pow(10, decimals)).toFixed(),
      decimals: Number(decimals),
      discount: fee.discountPercent || "1",
      isSubsidy,
    };
  }
});
