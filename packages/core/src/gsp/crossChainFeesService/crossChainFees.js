'use strict';

const BigNumber = require("bignumber.js");
const tool = require('../../utils/tool.js');

module.exports = class crossChainFees {
    async init(frameworkService) {
        this.m_frameworkService = frameworkService;
    }

    // agent fee
    async estimateOperationFee(tokenPairId, fromChainType, toChainType) {
        let tokenPairService = this.m_frameworkService.getService("TokenPairService");
        let tokenPair = tokenPairService.getTokenPair(tokenPairId);
        let iwanBCConnector = this.m_frameworkService.getService("iWanConnectorService");
        let connected = await iwanBCConnector.isConnected();
        if (connected === false) {
            throw new Error("iWan unavailable");
        }
        let decimals = (fromChainType === tokenPair.fromScInfo.chainType)? tokenPair.fromDecimals : tokenPair.toDecimals;
        let fee = await iwanBCConnector.estimateCrossChainOperationFee(fromChainType, toChainType, {tokenPairID: tokenPairId});
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
            decimals: Number(decimals)
        };
    }

    // contract fee
    async estimateNetworkFee(tokenPairId, fromChainType, toChainType, options) {
        let tokenPairService = this.m_frameworkService.getService("TokenPairService");
        let tokenPair = tokenPairService.getTokenPair(tokenPairId);
        let iwanBCConnector = this.m_frameworkService.getService("iWanConnectorService");
        let connected = await iwanBCConnector.isConnected();
        if (connected === false) {
            throw new Error("iWan unavailable");
        }
        let direction = (fromChainType === tokenPair.fromScInfo.chainType);
        let fromChainName = direction? tokenPair.fromScInfo.chainName : tokenPair.toScInfo.chainName;
        let decimals = direction? tokenPair.fromScInfo.chainDecimals : tokenPair.toScInfo.chainDecimals;
        let fee = await iwanBCConnector.estimateCrossChainNetworkFee(fromChainType, toChainType, {tokenPairID: tokenPairId, batchSize: options.batchSize});
        // console.debug("estimateNetworkFee %s->%s raw: %O", fromChainType, toChainType, fee);
        let feeBN = new BigNumber(fee.value);
        // ETH maybe has different symbos on layer2 chains, it leads networkFee unit problem, should use ancestorSymbol as unit
        let unit, tokenAccount = direction? tokenPair.fromAccount : tokenPair.toAccount;
        if (tokenAccount === "0x0000000000000000000000000000000000000000") { // coin
          unit = tokenPair.ancestorSymbol;
        } else {
          unit = tool.getCoinSymbol(fromChainType, fromChainName);
        }
        return {
            fee: fee.isPercent? feeBN.toFixed() : feeBN.div(Math.pow(10, decimals)).toFixed(),
            isRatio: fee.isPercent,
            unit,
            min: new BigNumber(fee.minFeeLimit || "0").div(Math.pow(10, decimals)).toFixed(),
            max: new BigNumber(fee.maxFeeLimit || "0").div(Math.pow(10, decimals)).toFixed(),
            decimals: Number(decimals)
        };
    }
};


