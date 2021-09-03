'use strict';
let BigNumber = require("bignumber.js");

module.exports = class crossChainFees {
    constructor() {
        this.m_mapProcessFeeHandle = new Map();
    }

    async init(frameworkService) {
        this.m_frameworkService = frameworkService;
        this.m_mapProcessFeeHandle.set("mintNetworkFee", this.getMintNetworkFee.bind(this));
        this.m_mapProcessFeeHandle.set("burnNetworkFee", this.getBurnNetworkFee.bind(this));
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
        let mint = new BigNumber(mintFees.lockFee);
        let mintFeeBN = mint;
        let pows = new BigNumber(Math.pow(10, tokenPairObj.fromScInfo.chainDecimals));
        mint = mint.div(pows);
        mint = mint.toFixed();
        let ret = {
            "fee": mint,
            "mintFee": mint,
            "feeBN": mintFeeBN,
            "mintFeeBN": mintFeeBN
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
        let burn = new BigNumber(burnFees.lockFee);
        let burnFeeBN = burn;
        let pows = new BigNumber(Math.pow(10, tokenPairObj.toScInfo.chainDecimals));
        burn = burn.div(pows);
        burn = burn.toFixed();
        let ret = {
            "fee": burn,
            "burnFee": burn,
            "feeBN": burnFeeBN,
            "burnFeeBN": burnFeeBN
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
        try {
            let tokenPairService = this.m_frameworkService.getService("TokenPairService");
            let tokenPairObj = await tokenPairService.getTokenPairObjById(tokenPairId);

            let chainInfoService = this.m_frameworkService.getService("ChainInfoService");
            let chainInfo = await chainInfoService.getChainInfoById(tokenPairObj.fromChainID);
            if (chainInfo.mintNetworkFee) {
                let feeHandle = this.m_mapProcessFeeHandle.get(chainInfo.mintNetworkFee);
                return await feeHandle(tokenPairObj);
            }
            else {
                return {
                    "fee": 0,
                    "feeBN": new BigNumber(0),
                    "mintFee": 0,
                    "mintFeeBN": new BigNumber(0),
                    "originFee": 0,
                    "originFeeBN": new BigNumber(0)
                };
            }
        }
        catch (err) {
            console.log("estimateMintNetworkFee err:", err);
        }
    }

    async estimateBurnNetworkFee(tokenPairId) {
        try {
            let tokenPairService = this.m_frameworkService.getService("TokenPairService");
            let tokenPairObj = await tokenPairService.getTokenPairObjById(tokenPairId);

            let chainInfoService = this.m_frameworkService.getService("ChainInfoService");
            let chainInfo = await chainInfoService.getChainInfoById(tokenPairObj.fromChainID);
            if (chainInfo.burnNetworkFee) {
                let feeHandle = this.m_mapProcessFeeHandle.get(chainInfo.burnNetworkFee);
                return await feeHandle(tokenPairObj);
            }
            else {
                return {
                    "fee": 0,
                    "feeBN": new BigNumber(0),
                    "burnFee": 0,
                    "burnFeeBN": new BigNumber(0),
                    "originFee": 0,
                    "originFeeBN": new BigNumber(0)
                };
            }

        }
        catch (err) {
            console.log("estimateBurnNetworkFee err:", err);
        }
    }

    async getBurnNetworkFee(tokenPairObj) {
        let iwanBCConnector = this.m_frameworkService.getService("iWanConnectorService");
        let fee = await iwanBCConnector.estimateNetworkFee(tokenPairObj.fromChainType, "release", tokenPairObj.toChainType);
        let feeBN = new BigNumber(fee);
        let originFee = fee;
        let originFeeBN = feeBN;
        feeBN = feeBN.div(Math.pow(10, parseInt(tokenPairObj.toDecimals)));
        fee = feeBN.toFixed();
        return {
            "fee": fee,
            "feeBN": feeBN,
            "burnFee": fee,
            "burnFeeBN": feeBN,
            "originFee": originFee,
            "originFeeBN": originFeeBN
        };
    }

    async getMintNetworkFee(tokenPairObj) {
        let iwanBCConnector = this.m_frameworkService.getService("iWanConnectorService");
        let fee = await iwanBCConnector.estimateNetworkFee(tokenPairObj.fromChainType, "lock", tokenPairObj.toChainType);
        let feeBN = new BigNumber(fee);
        let originFee = fee;
        let originFeeBN = feeBN;
        feeBN = feeBN.div(Math.pow(10, parseInt(tokenPairObj.fromDecimals)));
        fee = feeBN.toFixed();
        return {
            "fee": fee,
            "feeBN": feeBN,
            "mintFee": fee,
            "mintFeeBN": feeBN,
            "originFee": originFee,
            "originFeeBN": originFeeBN
        };
    }
};


