'use strict';
let BigNumber = require("bignumber.js");

module.exports = class crossChainFees {
    async init(frameworkService) {
        this.m_frameworkService = frameworkService;
    }

    // 费用，随tx的value字段发送的费用,serviceFee
    async getServcieFees(tokenPairId, typeOfMintOrBurn) {
        if (typeOfMintOrBurn === "MINT") {
            return this.getMintServcieFees(tokenPairId);
        } else if (typeOfMintOrBurn === "BURN") {
            return this.getBurnServiceFees(tokenPairId);
        } else {
            console.log("getServcieFees err typeOfMintOrBurn:", typeOfMintOrBurn);
        }
    }

    async getMintServcieFees(tokenPairId) {
        let tokenPairService = this.m_frameworkService.getService("TokenPairService");
        let tokenPair = await tokenPairService.getTokenPair(tokenPairId);

        //console.log("getMintServcieFees tokenPair:", tokenPair);
        let iwanBCConnector = this.m_frameworkService.getService("iWanConnectorService");
        let connected = await iwanBCConnector.isConnected();
        if (connected === false) {
            return;
        }

        let mintFees  = await iwanBCConnector.getCrossChainFees(tokenPair.fromChainType, [tokenPair.fromChainID, tokenPair.toChainID]);
        //console.log("mintFees:", mintFees);
        let feeBN = new BigNumber(mintFees.lockFee).div(Math.pow(10, tokenPair.fromScInfo.chainDecimals));
        let ret = {
            fee: feeBN.toFixed(),
            isRatio: false
        };
        //console.log("getMintServcieFees ret:", ret);
        return ret;
    }

    async getBurnServiceFees(tokenPairId) {
        let tokenPairService = this.m_frameworkService.getService("TokenPairService");
        let tokenPair = await tokenPairService.getTokenPair(tokenPairId);
        
        let iwanBCConnector = this.m_frameworkService.getService("iWanConnectorService");
        let connected = await iwanBCConnector.isConnected();
        if (connected === false) {
            return;
        }
        let burnFees = await iwanBCConnector.getCrossChainFees(tokenPair.toChainType, [tokenPair.toChainID, tokenPair.fromChainID]);
        //console.log("burnFees:", burnFees);
        let feeBN = new BigNumber(burnFees.lockFee).div(Math.pow(10, tokenPair.toScInfo.chainDecimals));
        let ret = {
            fee: feeBN.toFixed(),
            isRatio: false
        };
        //console.log("getBurnServiceFees ret:", ret);
        return ret;
    }

    // 传递给userBurn的fee参数
    // 20210202:只有BTC从WAN/ETH跨回BTC时需要,其余都是0,BTC目前暂时传0
    // typeOfMintOrBurn: MINT/BURN
    async estimateNetworkFee(tokenPairId, typeOfMintOrBurn) {
        if (typeOfMintOrBurn === "MINT") {
            return this.estimateMintNetworkFee(tokenPairId);
        } else if (typeOfMintOrBurn === "BURN") {
            return this.estimateBurnNetworkFee(tokenPairId);
        } else {
            console.log("estimateNetworkFee err typeOfMintOrBurn:", typeOfMintOrBurn);
        }
    }

    async estimateMintNetworkFee(tokenPairId) {
        let tokenPairService = this.m_frameworkService.getService("TokenPairService");
        let tokenPair = await tokenPairService.getTokenPair(tokenPairId);
        return this.getMintNetworkFee(tokenPair);
    }

    async estimateBurnNetworkFee(tokenPairId) {
        let tokenPairService = this.m_frameworkService.getService("TokenPairService");
        let tokenPair = await tokenPairService.getTokenPair(tokenPairId);
        return this.getBurnNetworkFee(tokenPair);
    }

    async getBurnNetworkFee(tokenPair) {
        let iwanBCConnector = this.m_frameworkService.getService("iWanConnectorService");
        let fee = await iwanBCConnector.estimateNetworkFee(tokenPair.fromChainType, "release", tokenPair.toChainType);
        let feeBN = new BigNumber(fee);
        console.log("getBurnNetworkFee tokenpair %s-%s: %s", tokenPair.fromChainType, tokenPair.toChainType, feeBN.toFixed())
        let isRatio = (tokenPair.id == 66)? true : false;
        if (!isRatio) {
            feeBN = feeBN.div(Math.pow(10, parseInt(tokenPair.decimals)));
        }
        return {
            fee: feeBN.toFixed(),
            isRatio
        };
    }

    async getMintNetworkFee(tokenPair) {
        let iwanBCConnector = this.m_frameworkService.getService("iWanConnectorService");
        let fee = await iwanBCConnector.estimateNetworkFee(tokenPair.fromChainType, "lock", tokenPair.toChainType);
        let feeBN = new BigNumber(fee);
        console.log("getMintNetworkFee tokenpair %s-%s: %s", tokenPair.fromChainType, tokenPair.toChainType, feeBN.toFixed())
        let isRatio = (tokenPair.id == 66)? true : false;
        if (!isRatio) {
            feeBN = feeBN.div(Math.pow(10, parseInt(tokenPair.decimals)));
        }
        return {
            fee: feeBN.toFixed(),
            isRatio
        };
    }
};


