"use strict";

class TokenPairService {
    constructor(isTestMode) {
        this.isTestMode = isTestMode;
        this.m_iwanConnected = false;
        this.m_mapTokenPairIdObj = new Map(); // tokenPairId => tokenPairObj
        this.m_mapTokenPairIdCfg = new Map(); // tokenPairId => tokenPairConfig
    }

    async init(frameworkService) {
        try {
            this.frameworkService = frameworkService;
            this.iwanBCConnector = frameworkService.getService("iWanConnectorService");
            this.eventService = frameworkService.getService("EventService");
            this.configService = frameworkService.getService("ConfigService");
            this.chainInfoService = frameworkService.getService("ChainInfoService");
            this.webStores = frameworkService.getService("WebStores");

            this.eventService.addEventListener("iwanConnected", this.onIwanConnected.bind(this));
            let tokenPairCfg = await this.configService.getGlobalConfig("tokenPairCfg");
            for (let idx = 0; idx < tokenPairCfg.length; ++idx) {
                let obj = tokenPairCfg[idx];
                this.m_mapTokenPairIdCfg.set(obj.id, obj);
            }
            // console.debug("tokenPairCfg: %O", this.m_mapTokenPairIdCfg);
        }
        catch (err) {
            console.log("StoremanService init err:", err);
        }
    }

    async onIwanConnected() {
        if (this.m_iwanConnected === false) {
            this.m_iwanConnected = true;
            await this.readAssetPair();
        }
    }

    async readAssetPair() {
        let t_start = new Date().getTime();
        try {
            let smgList = await this.iwanBCConnector.getStoremanGroupList();
            let workingList = [];
            for (let i = 0; i < smgList.length; i++) {
                let group = smgList[i];
                let curTime = new Date().getTime();
                let startTime = group.startTime * 1000;
                let endTime = group.endTime * 1000;
                if ((group.status == 5) && (curTime > startTime) && (curTime < endTime)) {
                    workingList.push(group);
                }
            }
            workingList.sort((a, b) => (b.endTime - b.startTime) - (a.endTime - a.startTime));
            let network = this.configService.getNetwork();
            let options = ((network === "mainnet") && !this.isTestMode)? {tags: ["bridge"]} : {isAllTokenPairs: true};
            let tokenPairs = await this.iwanBCConnector.getTokenPairs(options);
            let tokenPairMap = new Map();
            await Promise.all(tokenPairs.map(async (pair) => {
                if (pair.ancestorSymbol !== "EOS") { // hide legacy tokens
                    let valid = await this.updateTokenPairInfo(pair);
                    if (valid) { // ignore unsupported token pair
                        pair.storemangroupList = workingList;
                        tokenPairMap.set(pair.id, pair);
                    }
                }
            }));
            this.webStores.assetPairs.setAssetPairs(Array.from(tokenPairMap.values()), workingList);
            this.m_mapTokenPairIdObj = tokenPairMap;
            this.eventService.emitEvent("StoremanServiceInitComplete", true);
            // console.log("tokenPairs: %O", tokenPairs);
        } catch (err) {
            this.eventService.emitEvent("StoremanServiceInitComplete", false);
            console.log("readAssetPair err: %O", err);
        }
        let t_end = new Date().getTime();
        console.log("readAssetPair consume %s ms", t_end - t_start);
    }

    async getTokenPairObjById(tokenPairId) {
        let tokenPairObj = this.m_mapTokenPairIdObj.get(tokenPairId);
        return tokenPairObj;
    }

    async updateTokenPairInfo(tokenPair) {
        tokenPair.fromScInfo = this.chainInfoService.getChainInfoById(tokenPair.fromChainID);
        tokenPair.toScInfo = this.chainInfoService.getChainInfoById(tokenPair.toChainID);
        if (tokenPair.fromScInfo && tokenPair.toScInfo) {
            try {
                await Promise.all([
                    this.updateTokenPairFromChainInfo(tokenPair),
                    this.updateTokenPairToChainInfo(tokenPair),
                    this.updateTokenPairCcHandle(tokenPair)
                ]);
                return true;
            } catch(err) {
                console.error("ignore unavailable token pair %s(%s, %s<->%s): %O", tokenPair.id, tokenPair.ancestorSymbol, tokenPair.fromChainName, tokenPair.toChainName, err);
                return false; // can not get token info from chain
            }
        } else {
            console.log("ignore unsupported token pair %s(%s, %s<->%s)", tokenPair.id, tokenPair.ancestorSymbol, tokenPair.fromChainName, tokenPair.toChainName);
            return false; // lack of chain config, need to upgrade sdk
        }
    }

    async updateTokenPairFromChainInfo(tokenPair) {
        tokenPair.fromChainType = tokenPair.fromScInfo.chainType;
        tokenPair.fromChainName = tokenPair.fromScInfo.chainName;
        if (tokenPair.fromAccount === "0x0000000000000000000000000000000000000000") {
            tokenPair.fromSymbol = tokenPair.ancestorSymbol;
            tokenPair.fromDecimals = tokenPair.ancestorDecimals;
        } else {
            let tokenInfo = await this.iwanBCConnector.getTokenInfo(tokenPair.fromChainType, tokenPair.fromAccount);
            tokenPair.fromSymbol = tokenInfo.symbol;
            tokenPair.fromDecimals = tokenInfo.decimals;
        }
    }

    async updateTokenPairToChainInfo(tokenPair) {
        tokenPair.toChainType = tokenPair.toScInfo.chainType;
        tokenPair.toChainName = tokenPair.toScInfo.chainName;
        tokenPair.toSymbol = tokenPair.symbol;
        tokenPair.toDecimals = tokenPair.decimals;
    }

    async updateTokenPairCcHandle(tokenPair) {
        let fromChainInfo = tokenPair.fromScInfo;
        tokenPair.ccType = {};

        // 1 1.1 最细粒度:tokenPair级别,根据tokenId配置处理特殊tokenPair的MINT/BURN
        //       目前只处理EOS跨到WAN后的token,token在WAN<->ETH之间互跨
        //   1.2 20210324 针对FNX和CFNX特殊处理
        let tokenPairCfg = this.m_mapTokenPairIdCfg.get(tokenPair.id);
        if (tokenPairCfg) {
            tokenPair.ccType["MINT"] = tokenPairCfg.mintHandle;
            tokenPair.ccType["BURN"] = tokenPairCfg.burnHandle;
            if (tokenPairCfg.fromNativeToken) {
                tokenPair.fromNativeToken = tokenPairCfg.fromNativeToken;
            }
            if (tokenPairCfg.toNativeToken) {
                tokenPair.toNativeToken = tokenPairCfg.toNativeToken;
            }
            return;
        }

        // 2 根据一般规律处理普通tokenPair
        // 2.1 MINT
        if (fromChainInfo.mintFromChainHandle) {
            // mintFromChainHandle该配置项只适用于其他链向WAN/ETH跨链的tokenPair
            // 20210208 目前BTC/XRP均需配置,其他链跨向WAN/ETH的coin均需配置
            tokenPair.ccType["MINT"] = fromChainInfo.mintFromChainHandle;
        } else {
            // ETH <-> WAN 祖先链为ETH/WAN
            if (tokenPair.fromChainID === tokenPair.ancestorChainID) {
                if (tokenPair.fromAccount === "0x0000000000000000000000000000000000000000") {
                    // WanCoin->ETH EthCoin->WAN
                    tokenPair.ccType["MINT"] = "MintCoin";
                } else {
                    // token WAN <-> ETH
                    tokenPair.ccType["MINT"] = "MintErc20";
                }
            } else {
                // 祖先链是其他链,coin跨到WAN/ETH后,其对应token在ETH/WAN之间互跨,双向都是userBurn,
                // btc/xrp对应的token,在WAN <-> ETH之间互跨
                tokenPair.ccType["MINT"] = "MintOtherCoinBetweenEthWanHandle";
            }
        }

        // 2.2 BURN
        if (fromChainInfo.burnToChainHandle) {
            // burn该配置项只适用于从WAN/ETH跨回原链
            // 20210208 目前BTC/XRP均需配置,其他链跨向WAN/ETH的coin均需配置
            tokenPair.ccType["BURN"] = fromChainInfo.burnToChainHandle;
        } else {
            // ETH <-> WAN 祖先链为ETH/WAN
            if (tokenPair.fromChainID === tokenPair.ancestorChainID) {
                // token burn to 原链
                tokenPair.ccType["BURN"] = "BurnErc20";
            } else {
                // btc/xrp对应的token,在WAN <-> ETH之间互跨
                tokenPair.ccType["BURN"] = "BurnOtherCoinBetweenEthWanHandle";
            }
        }
    }
};

module.exports = TokenPairService;