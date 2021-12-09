'use strict';

const BigNumber = require("bignumber.js");

const NOT_SMART_CONTRACT_CHAINS = ['BTC', 'LTC', 'XRP', 'DOT', 'DOGE'];

module.exports = class crossChainFees {
    async init(frameworkService) {
        this.m_frameworkService = frameworkService;
    }

    // 费用，随tx的value字段发送的费用,serviceFee
    async getServcieFees(tokenPairId, typeOfMintOrBurn) {
        if (typeOfMintOrBurn === "MINT") {
            return await this.getMintServcieFees(tokenPairId);
        }
        else if (typeOfMintOrBurn === "BURN") {
            return await this.getBurnServiceFees(tokenPairId);
        }
        else {
            console.log("getServcieFees err typeOfMintOrBurn:", typeOfMintOrBurn);
        }
    }

    async getMintServcieFees(tokenPairId) {
        let tokenPairService = this.m_frameworkService.getService("TokenPairService");
        let tokenPairObj = await tokenPairService.getTokenPairObjById(tokenPairId);

        //console.log("getMintServcieFees tokenPairObj:", tokenPairObj);
        let iwanBCConnector = this.m_frameworkService.getService("iWanConnectorService");
        let connected = await iwanBCConnector.isConnected();
        if (connected === false) {
            return;
        }

        let mintFees  = await iwanBCConnector.getCrossChainFees(tokenPairObj.fromChainType, [tokenPairObj.fromChainID, tokenPairObj.toChainID]);
        //console.log("mintFees:", mintFees);
        let originFeeBN = new BigNumber(mintFees.lockFee);
        let feeBN = originFeeBN.div(Math.pow(10, tokenPairObj.fromScInfo.chainDecimals));
        let ret = {
            fee: feeBN.toFixed(),
            feeBN: feeBN,
            originFee: originFeeBN.toFixed(),
            originFeeBN: originFeeBN,
            isRatio: false
        };
        //console.log("getMintServcieFees ret:", ret);
        return ret;
    }

    async getBurnServiceFees(tokenPairId) {
        let tokenPairService = this.m_frameworkService.getService("TokenPairService");
        let tokenPairObj = await tokenPairService.getTokenPairObjById(tokenPairId);
        
        let iwanBCConnector = this.m_frameworkService.getService("iWanConnectorService");
        let connected = await iwanBCConnector.isConnected();
        if (connected === false) {
            return;
        }
        let burnFees = await iwanBCConnector.getCrossChainFees(tokenPairObj.toChainType, [tokenPairObj.toChainID, tokenPairObj.fromChainID]);
        //console.log("burnFees:", burnFees);
        let originFeeBN = new BigNumber(burnFees.lockFee);
        let feeBN = originFeeBN.div(Math.pow(10, tokenPairObj.toScInfo.chainDecimals));
        let ret = {
            fee: feeBN.toFixed(),
            feeBN: feeBN,
            originFee: originFeeBN.toFixed(),
            originFeeBN: originFeeBN,
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
        }
        else if (typeOfMintOrBurn === "BURN") {
            return this.estimateBurnNetworkFee(tokenPairId);
        }
        else {
            console.log("estimateNetworkFee err typeOfMintOrBurn:", typeOfMintOrBurn);
        }
    }

    async estimateMintNetworkFee(tokenPairId) {
        let tokenPairService = this.m_frameworkService.getService("TokenPairService");
        let tokenPairObj = await tokenPairService.getTokenPairObjById(tokenPairId);
        let fee = await this.getMintNetworkFee(tokenPairObj);
        return fee;
    }

    async estimateBurnNetworkFee(tokenPairId) {
        let tokenPairService = this.m_frameworkService.getService("TokenPairService");
        let tokenPairObj = await tokenPairService.getTokenPairObjById(tokenPairId);
        let fee = await this.getBurnNetworkFee(tokenPairObj);
        return fee;
    }

    async getBurnNetworkFee(tokenPairObj) {
        let iwanBCConnector = this.m_frameworkService.getService("iWanConnectorService");
        let fee = await iwanBCConnector.estimateNetworkFee(tokenPairObj.fromChainType, "release", tokenPairObj.toChainType);
        let feeBN = new BigNumber(fee);
        console.log("getBurnNetworkFee tokenpair %s-%s: %s", tokenPairObj.fromChainType, tokenPairObj.toChainType, feeBN.toFixed())
        let originFee = fee;
        let originFeeBN = feeBN;
        let isRatio = !(NOT_SMART_CONTRACT_CHAINS.includes(tokenPairObj.fromChainType) || NOT_SMART_CONTRACT_CHAINS.includes(tokenPairObj.toChainType));
        if (!isRatio) {
            feeBN = feeBN.div(Math.pow(10, parseInt(tokenPairObj.decimals)));
        }
        fee = feeBN.toFixed();
        return {
            fee: fee,
            feeBN: feeBN,
            originFee: originFee,
            originFeeBN: originFeeBN,
            isRatio
        };
    }

    async getMintNetworkFee(tokenPairObj) {
        let iwanBCConnector = this.m_frameworkService.getService("iWanConnectorService");
        let fee = await iwanBCConnector.estimateNetworkFee(tokenPairObj.fromChainType, "lock", tokenPairObj.toChainType);
        let feeBN = new BigNumber(fee);
        console.log("getMintNetworkFee tokenpair %s-%s: %s", tokenPairObj.fromChainType, tokenPairObj.toChainType, feeBN.toFixed())
        let originFee = fee;
        let originFeeBN = feeBN;
        let isRatio = !(NOT_SMART_CONTRACT_CHAINS.includes(tokenPairObj.fromChainType) || NOT_SMART_CONTRACT_CHAINS.includes(tokenPairObj.toChainType));
        if (!isRatio) {
            feeBN = feeBN.div(Math.pow(10, parseInt(tokenPairObj.decimals)));
        }
        fee = feeBN.toFixed();
        return {
            fee: fee,
            feeBN: feeBN,
            originFee: originFee,
            originFeeBN: originFeeBN,
            isRatio
        };
    }
};


