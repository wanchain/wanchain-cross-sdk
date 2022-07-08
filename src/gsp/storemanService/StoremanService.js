"use strict";

const BigNumber = require("bignumber.js");

const SELF_WALLET_BALANCE_CHAINS = ["DOT", "ADA"]; // TRX has self wallet but also be supported by rpc 

class StoremanService {
    constructor() {
    }

    async init(frameworkService) {
        try {
            this.m_frameworkService = frameworkService;
            this.m_iwanBCConnector = frameworkService.getService("iWanConnectorService");
        } catch (err) {
            console.log("StoremanService init err:", err);
        }
    }

    async getStroremanGroupQuotaInfo(fromChainType, tokenPairId, storemanGroupId) {
        try {
            let tokenPairService = this.m_frameworkService.getService("TokenPairService");
            let tokenPair = tokenPairService.getTokenPair(tokenPairId);
            if (tokenPair) {
                let toChainType = (fromChainType === tokenPair.fromChainType)? tokenPair.toChainType : tokenPair.fromChainType;
                let decimals = (fromChainType === tokenPair.fromChainType)? tokenPair.fromDecimals : tokenPair.toDecimals;
                if (tokenPair.ancestorSymbol === "EOS" && tokenPair.fromChainType === fromChainType) {
                    // wanEOS特殊处理wan -> eth mint storeman采用旧的处理方式
                    fromChainType = "EOS";
                }
                let quota = await this.m_iwanBCConnector.getStoremanGroupQuota(fromChainType, storemanGroupId, [tokenPair.ancestorSymbol], toChainType);
                // console.debug("getStroremanGroupQuotaInfo: %s, %s, %s, %s, %O", fromChainType, storemanGroupId, tokenPair.ancestorSymbol, toChainType, quota);
                let maxQuota = new BigNumber(quota[0].maxQuota).div(Math.pow(10, parseInt(decimals)));
                let minQuota = new BigNumber(quota[0].minQuota).div(Math.pow(10, parseInt(decimals)));
                return {maxQuota: maxQuota.toFixed(), minQuota: minQuota.toFixed()};
            }            
        } catch (err) {
            console.error("getStroremanGroupQuotaInfo error: %O", err);
        }
        return {maxQuota: "0", minQuota: "0"};
    }

    async getConvertInfo(convertJson) {
        let cctHandleService = this.m_frameworkService.getService("CCTHandleService");
        return cctHandleService.getConvertInfo(convertJson);
    }

    async processTxTask(taskParas, wallet) {
        let txTaskHandleService = this.m_frameworkService.getService("TxTaskHandleService");
        return txTaskHandleService.processTxTask(taskParas, wallet);
    }

    async getAccountBalance(assetPairId, type, addr, options = {}) {
        try {
            let tokenPairService = this.m_frameworkService.getService("TokenPairService");
            let assetPair = tokenPairService.getTokenPair(assetPairId);
            if (!assetPair) {
                return new BigNumber(0);
            }
            let balance, decimals, kaChainInfo = null;
            let wallet = options.wallet; // third party wallet is required
            if (options.isCoin) {
                if (type === "MINT") {
                    if (SELF_WALLET_BALANCE_CHAINS.includes(assetPair.fromChainType)) {
                        balance = await wallet.getBalance(addr);
                    } else {
                        balance = await this.m_iwanBCConnector.getBalance(assetPair.fromChainType, addr);
                    }
                    kaChainInfo = assetPair.fromScInfo;
                    decimals = assetPair.fromScInfo.chainDecimals;
                } else if (type === "BURN") {
                    if (SELF_WALLET_BALANCE_CHAINS.includes(assetPair.toChainType)) {
                        balance = await wallet.getBalance(addr);
                    } else {
                        balance = await this.m_iwanBCConnector.getBalance(assetPair.toChainType, addr);
                    }
                    decimals = assetPair.toScInfo.chainDecimals;
                }
            } else {
                if (type === "MINT") {
                    if (assetPair.fromAccount === "0x0000000000000000000000000000000000000000") {
                        // COIN
                        if (SELF_WALLET_BALANCE_CHAINS.includes(assetPair.fromChainType)) {
                            balance = await wallet.getBalance(addr);
                        } else {
                            balance = await this.m_iwanBCConnector.getBalance(assetPair.fromChainType, addr);
                        }
                        kaChainInfo = assetPair.fromScInfo;
                    } else {
                        balance = await this.m_iwanBCConnector.getTokenBalance(assetPair.fromChainType, addr, assetPair.fromAccount);
                    }
                    decimals = assetPair.fromDecimals;
                } else if (type === "BURN") {
                    balance = await this.m_iwanBCConnector.getTokenBalance(assetPair.toChainType, addr, assetPair.toAccount);
                    decimals = assetPair.toDecimals;
                }
            }
            balance = new BigNumber(balance).div(Math.pow(10, decimals));
            if (kaChainInfo && options.keepAlive) {
                if (kaChainInfo.minReserved) {
                    balance = balance.minus(kaChainInfo.minReserved);
                    if (balance.lt(0)) {
                        balance = new BigNumber(0);
                    }
                }
            }
            return balance;
        } catch (err) {
            console.error("get assetPair %s type %s address %s balance error: %O", assetPairId, type, addr, err);
            return new BigNumber(0);
        }
    }

    async checkAccountOwnership(assetPairId, type, addr, tokenId) {
        try {
            let tokenPairService = this.m_frameworkService.getService("TokenPairService");
            let assetPair = tokenPairService.getTokenPair(assetPairId);
            if (!assetPair) {
                return false;
            }
            let chain = (type === "MINT")? assetPair.fromChainType : assetPair.toChainType;
            let token = (type === "MINT")? assetPair.fromAccount : assetPair.toAccount;
            let isOwnable = await this.m_iwanBCConnector.checkErc721Ownership(chain, token, tokenId, addr);
            return isOwnable;
        } catch (err) {
            console.error("check assetPair %s type %s address %s token %s ownership error: %O", assetPairId, type, addr, tokenId, err);
            return false;
        }
    }

    getTokenPair(tokenPairId) {
        let tokenPairService = this.m_frameworkService.getService("TokenPairService");
        return tokenPairService.getTokenPair(tokenPairId);
    }

    async updateSmgs() {
        let tokenPairService = this.m_frameworkService.getService("TokenPairService");
        return tokenPairService.updateSmgs();
    }

    getAssetLogo(name) {
      let tokenPairService = this.m_frameworkService.getService("TokenPairService");
      return tokenPairService.getAssetLogo(name);
    }

    getChainLogo(chainType) {
      let tokenPairService = this.m_frameworkService.getService("TokenPairService");
      return tokenPairService.getChainLogo(chainType);
    }
};

module.exports = StoremanService;


