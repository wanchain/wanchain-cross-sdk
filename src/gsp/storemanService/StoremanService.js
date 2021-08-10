"use strict";
let BigNumber = require("bignumber.js");

class StoremanService {
    constructor() {
    }

    async init(frameworkService) {
        try {
            this.m_frameworkService = frameworkService;
            this.m_iwanBCConnector = frameworkService.getService("iWanConnectorService");
        }
        catch (err) {
            console.log("StoremanService init err:", err);
        }
    }

    async getStroremanGroupQuotaInfo(fromChainType, tokenPairId, storemanGroupId) {
        try {
            let tokenPairService = this.m_frameworkService.getService("TokenPairService");
            let obj_tokenPair = await tokenPairService.getTokenPairObjById(tokenPairId); //WYH: 是从内存中取
            if (obj_tokenPair) {
                if (obj_tokenPair.ancestorSymbol === "EOS" && obj_tokenPair.fromChainType === fromChainType) {
                    // wanEOS特殊处理wan -> eth mint storeman采用旧的处理方式
                    fromChainType = "EOS";
                }
                //console.log("getStroremanGroupQuotaInfo:", fromChainType, storemanGroupId, [obj_tokenPair.ancestorSymbol]);
                let ret = await this.m_iwanBCConnector.getStoremanGroupQuota(fromChainType, storemanGroupId, [obj_tokenPair.ancestorSymbol]);
                //console.log("mint ret:", ret);
                let maxQuota = new BigNumber(ret[0].maxQuota).div(Math.pow(10, parseInt(obj_tokenPair.ancestorDecimals)));
                let minQuota = new BigNumber(ret[0].minQuota).div(Math.pow(10, parseInt(obj_tokenPair.ancestorDecimals)));
                ret = {
                    "maxQuota": maxQuota.toString(),
                    "minQuota": minQuota.toString()
                };
                return ret;
            }
            return {};
        }
        catch (err) {
            console.log("getStroremanGroupQuotaInfo err:", err);
            return {};
        }
    }
    async getConvertInfo(convertJson) {
        let cctHandleService = this.m_frameworkService.getService("CCTHandleService");
        return await cctHandleService.getConvertInfo(convertJson);
    }

    async processTxTask(taskParas, wallet) {
        let txTaskHandleService = this.m_frameworkService.getService("TxTaskHandleService");
        await txTaskHandleService.processTxTask(taskParas, wallet);
    }

    // assetPairId,Mint/Burn,addr
    async getAccountBalance(assetPairId, type, addr, isCoin) { //WYH: TODO：这个调用频率如何？ ==》 好像不会呈 线性增长，还行，可以不优化
        try {
            let tokenPairService = this.m_frameworkService.getService("TokenPairService");
            let assetPair = await tokenPairService.getTokenPairObjById(assetPairId);
            if (!assetPair) {
                return 0;
            }
            if (isCoin) {
                let balance;
                let decimals;
                if (type === "MINT") {
                    decimals = assetPair.fromDecimals;
                    if (assetPair.fromChainType === "DOT") {
                        let polkadotService = this.m_frameworkService.getService("PolkadotService");
                        balance = await polkadotService.getBalance(addr);
                    } else {
                        balance = await this.m_iwanBCConnector.getBalance(assetPair.fromChainType, addr);
                    }
                }
                else if (type === "BURN") {
                    if (assetPair.toChainType === "DOT") {
                        let polkadotService = this.m_frameworkService.getService("PolkadotService");
                        balance = await polkadotService.getBalance(addr);
                    } else {
                        balance = await this.m_iwanBCConnector.getBalance(assetPair.toChainType, addr);
                    }
                    decimals = assetPair.toDecimals;
                }
                balance = new BigNumber(balance);
                let pows = new BigNumber(Math.pow(10, decimals));
                balance = balance.div(pows);
                return balance;
            }
            else {
                let balance;
                let decimals;
                if (type === "MINT") {
                    decimals = assetPair.fromDecimals;
                    if (assetPair.fromAccount === "0x0000000000000000000000000000000000000000") {
                        // COIN
                        if (assetPair.fromChainType === "DOT") {
                            let polkadotService = this.m_frameworkService.getService("PolkadotService");
                            console.log({polkadotService})
                            balance = await polkadotService.getBalance(addr);
                        } else {
                            balance = await this.m_iwanBCConnector.getBalance(assetPair.fromChainType, addr);
                        }
                    }
                    else {
                        balance = await this.m_iwanBCConnector.getTokenBalance(assetPair.fromChainType, addr, assetPair.fromAccount);
                    }
                }
                else if (type === "BURN") {
                    balance = await this.m_iwanBCConnector.getTokenBalance(assetPair.toChainType, addr, assetPair.toAccount);
                    decimals = assetPair.toDecimals;
                }

                balance = new BigNumber(balance);
                let pows = new BigNumber(Math.pow(10, decimals));
                balance = balance.div(pows);
                return balance;
            }
        }
        catch (err) {
            console.log("get assetPair %s type %s address %s balance err:", assetPairId, type, addr, err);
            return 0;
        }
    }

    async getTokenPairObjById(tokenPairId) {
        let tokenPairService = this.m_frameworkService.getService("TokenPairService");
        let tokenPairObj = await tokenPairService.getTokenPairObjById(tokenPairId);
        return tokenPairObj;
    }
};

module.exports = StoremanService;


