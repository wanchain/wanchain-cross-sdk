'use strict';

const BigNumber = require("bignumber.js");
const tool = require('../../utils/tool.js');

module.exports = class crossChainFees {
    async init(frameworkService) {
        this.m_frameworkService = frameworkService;
    }

    // agent fee
    async estimateOperationFee(tokenPairId, direction) {
        let tokenPairService = this.m_frameworkService.getService("TokenPairService");
        let tokenPair = tokenPairService.getTokenPair(tokenPairId);
        let iwanBCConnector = this.m_frameworkService.getService("iWanConnectorService");
        let connected = await iwanBCConnector.isConnected();
        if (connected === false) {
            throw new Error("iWan is unavailable");
        }
        let src = (direction === "MINT")? tokenPair.fromScInfo : tokenPair.toScInfo;
        let target = (direction === "MINT")? tokenPair.toScInfo : tokenPair.fromScInfo;
        let decimals = (direction === "MINT")? tokenPair.fromDecimals : tokenPair.toDecimals;
        let fee = await iwanBCConnector.estimateCrossChainOperationFee(src.chainType, target.chainType, {tokenPairID: tokenPairId});
        if (tokenPair.toAccountType !== "Erc20") {
            fee.value = "0";
        }
        // console.debug("estimateOperationFee %s->%s raw: %O", src.chainType, target.chainType, fee);
        let feeBN = new BigNumber(fee.value);
        let ret = {
            fee: fee.isPercent? feeBN.toFixed() : feeBN.div(Math.pow(10, decimals)).toFixed(),
            isRatio: fee.isPercent,
            unit: tool.parseTokenPairSymbol(tokenPair.ancestorChainID, tokenPair.ancestorSymbol)
        };
        return ret;
    }

    // contract fee
    async estimateNetworkFee(tokenPairId, direction, options) {
        let tokenPairService = this.m_frameworkService.getService("TokenPairService");
        let tokenPair = tokenPairService.getTokenPair(tokenPairId);
        let iwanBCConnector = this.m_frameworkService.getService("iWanConnectorService");
        let connected = await iwanBCConnector.isConnected();
        if (connected === false) {
            throw new Error("iWan is unavailable");
        }
        let src = (direction === "MINT")? tokenPair.fromScInfo : tokenPair.toScInfo;
        let target = (direction === "MINT")? tokenPair.toScInfo : tokenPair.fromScInfo;
        let fee = await iwanBCConnector.estimateCrossChainNetworkFee(src.chainType, target.chainType, {tokenPairID: tokenPairId, batchSize: options.batchSize});
        // console.debug("estimateNetworkFee %s->%s raw: %O", src.chainType, target.chainType, fee);
        let feeBN = new BigNumber(fee.value);
        return {
            fee: fee.isPercent? feeBN.toFixed() : feeBN.div(Math.pow(10, src.chainDecimals)).toFixed(),
            isRatio: fee.isPercent,
            unit: tool.getCoinSymbol(src.chainType, src.chainName)
        };
    }
};


