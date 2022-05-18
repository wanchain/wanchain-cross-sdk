"use strict";

const crypto = require('crypto');
const Identicon = require('identicon.js');
const util = require('util');

class TokenPairService {
    constructor(isTestMode) {
        this.isTestMode = isTestMode;
        this.m_iwanConnected = false;
        this.m_mapTokenPair = new Map(); // tokenPairId => tokenPair
        this.m_mapTokenPairCfg = new Map(); // tokenPairId => tokenPairConfig
        this.tokenSymbol = new Map(); // chain-address => symbol
        this.assetLogo = new Map(); // name => logo
        this.storageService = null; // init after token pair service
        this.forceRefresh = false;
    }

    async init(frameworkService) {
        try {
            this.frameworkService = frameworkService;
            this.iwanBCConnector = frameworkService.getService("iWanConnectorService");
            this.eventService = frameworkService.getService("EventService");
            this.configService = frameworkService.getService("ConfigService");
            this.chainInfoService = frameworkService.getService("ChainInfoService");
            this.webStores = frameworkService.getService("WebStores");
            this.uiStrService = frameworkService.getService("UIStrService");

            this.eventService.addEventListener("iwanConnected", this.onIwanConnected.bind(this));
            let tokenPairCfg = await this.configService.getGlobalConfig("tokenPairCfg");
            tokenPairCfg.map(tp => {
              this.m_mapTokenPairCfg.set(tp.id, tp);
            })
            // console.debug("tokenPairCfg: %O", this.m_mapTokenPairCfg);
        } catch (err) {
            console.log("StoremanService init err:", err);
        }
    }

    async onIwanConnected() {
        if (this.m_iwanConnected === false) {
            this.m_iwanConnected = true;
            await this.readAssetPair();
        }
    }

    async getSmgs() {
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
        if (workingList.length > 0) {
            workingList.sort((a, b) => (b.endTime - b.startTime) - (a.endTime - a.startTime));
            return workingList;
        } else {
            throw new Error("Smg unavailable");
        }
    }

    async readAssetPair() {
        this.storageService = this.frameworkService.getService("StorageService");
        try {
            let ts0 = new Date().getTime();
            let tokenPairs = await this.readTokenpairs();
            tokenPairs = tokenPairs.filter(tp => tp.ancestorSymbol !== "EOS"); // hide deprecated tokens
            let ts1 = new Date().getTime();
            console.debug("readTokenpairs consume %s ms", ts1 - ts0);

            let [smgList, [supportedTokenPairs, tokenSymbolCacheOld]] = await Promise.all([
              this.getSmgs(),
              this.readTokenSymbols(tokenPairs)
            ]);
            let ts2 = new Date().getTime();
            console.debug("readTokenSymbols consume %s/%s ms", ts2 - ts1, ts2 - ts0);
                
            let tokenPairMap = new Map();
            let tokenSymbolCacheNew = new Map();
            supportedTokenPairs.map(tp => { // update fromSymbol
              if (tp.fromAccount === "0x0000000000000000000000000000000000000000") {
                tp.fromSymbol = tp.ancestorSymbol;
                tokenPairMap.set(tp.id, tp);
              } else {
                let key = util.format("%s-%s-%s", tp.fromChainType, tp.fromAccount, tp.fromAccountType);
                let fromSymbol = tokenSymbolCacheOld.get(key);
                if (fromSymbol) {
                  tp.fromSymbol = fromSymbol;
                  tokenPairMap.set(tp.id, tp);
                  tokenSymbolCacheNew.set(key, fromSymbol);
                } else {
                  console.error("ignore unavailable token pair %s(%s, %s<->%s)", tp.id, tp.ancestorSymbol, tp.fromChainName, tp.toChainName);
                }
              }
            })
            // console.debug("supportedTokenPairs: %O", supportedTokenPairs);
            this.webStores.assetPairs.setAssetPairs(Array.from(tokenPairMap.values()), smgList);
            this.m_mapTokenPair = tokenPairMap;
            this.tokenSymbol = tokenSymbolCacheNew;
            this.storageService.setCacheData("TokenSymbol", Array.from(tokenSymbolCacheNew));
            if (typeof(window) !== "undefined") {
              await this.readAssetLogos();
            }
            let ts3 = new Date().getTime();
            console.debug("readAssetLogos consume %s/%s ms", ts3 - ts2, ts3 - ts0);
            this.eventService.emitEvent("StoremanServiceInitComplete", true);
        } catch (err) {
            this.eventService.emitEvent("StoremanServiceInitComplete", false);
            console.error("readAssetPair error: %O", err);
        }
    }

    async readTokenpairs() {
      let uiVer = this.uiStrService.getStrByName("CacheVersion") || "0";
      let iwanVer = await this.iwanBCConnector.getTokenPairsHash();
      let verCache = this.storageService.getCacheData("Version") || {};
      console.debug({uiVer, iwanVer, verCache});
      this.forceRefresh = (verCache.ui !== uiVer);      
      let tokenPairs = [];
      if ((!this.forceRefresh) && (iwanVer === verCache.iwan)) {
        tokenPairs = this.storageService.getCacheData("TokenPair") || [];
        if (tokenPairs.length) { // maybe localstoreage TokenPair is cleared
          console.debug("all tokenpair hit cache");
          return tokenPairs;
        }
      }
      let network = this.configService.getNetwork();
      let options = ((network === "mainnet") && !this.isTestMode)? {tags: ["bridge"]} : {isAllTokenPairs: true};
      tokenPairs = await this.iwanBCConnector.getTokenPairs(options);
      this.storageService.setCacheData("TokenPair", tokenPairs);
      this.storageService.setCacheData("Version", {ui: uiVer, iwan: iwanVer});
      return tokenPairs;
    }

    async readTokenSymbols(tokenPairs) {
      let cache = this.forceRefresh? [] : (this.storageService.getCacheData("TokenSymbol") || []);
      let tokenSymbolCacheOld = new Map(cache);
      let missSymbols = 0;
      tokenPairs = tokenPairs.filter(tp => {
        if (this.updateTokenPairInfo(tp)) { // ignore unsupported token pair                
          if (tp.fromAccount !== "0x0000000000000000000000000000000000000000") {
            let key = util.format("%s-%s-%s", tp.fromChainType, tp.fromAccount, tp.fromAccountType);
            if (!tokenSymbolCacheOld.get(key)) {
              missSymbols++;
              tokenSymbolCacheOld.set(key, "");
              // console.debug("%s %s symbol miss cache", tp.fromChainType, tp.fromAccount);
            }
          }
          return true;
        } else {
          return false;
        }
      });
      let ps = []; // this.getSmgs()
      if (missSymbols) {
        let ps = [];
        let iwan = this.iwanBCConnector;
        Array.from(tokenSymbolCacheOld.keys()).map(async (tsk) => {
          let [chain, account, type] = tsk.split("-");
          if (!tokenSymbolCacheOld.get(tsk)) {
            ps.push(async function(chain, account, type) {
              try {
                let ti = await iwan.getTokenInfo(chain, account, type);
                tokenSymbolCacheOld.set(tsk, ti.symbol);
                // console.debug("%s getTokenInfo: %s", tsk, ti.symbol);
              } catch (err) {
                console.error("%s getTokenInfo error: %O", tsk, err);
              }
            }(chain, account, type));
          }
        })
        await Promise.all(ps);
      } else {
        console.debug("all symbol hit cache");
      }
      return [tokenPairs, tokenSymbolCacheOld];
    }

    async readAssetLogos() {
      let assetMap = new Map();
      let tokenMap = new Map();
      let accountSet = new Set();
      this.m_mapTokenPair.forEach(tp => {
        if (tp.fromChainID === tp.ancestorChainID) {
          assetMap.set(tp.ancestorSymbol, {chain: tp.fromChainType, address: tp.fromAccount});
        }
      });
      let cache = this.forceRefresh? [] : (this.storageService.getCacheData("AssetLogo") || []);
      let logoMapCacheOld = new Map(cache);
      let logoMapCacheNew = new Map();
      assetMap.forEach((v, k) => {
        let logo = logoMapCacheOld.get(k);
        if (logo) {
          logoMapCacheNew.set(k, logo);
        } else {
          tokenMap.set(v.chain + "-" + v.address, k);
          accountSet.add(v.address);
          // console.debug("%s %s(%s) logo miss cache", v.chain, k, v.address);
        }
      });
      let tokenScAddr = Array.from(accountSet);
      if (tokenScAddr.length) {
        let logos = await this.iwanBCConnector.getRegisteredOrigToken({tokenScAddr, limit: tokenScAddr.length * 2});
        // console.debug({logos});
        logos.forEach(v => {
          let asset = tokenMap.get(v.chainType + "-" + v.tokenScAddr);
          if (asset) {
            logoMapCacheNew.set(asset, {data: v.iconData, type: v.iconType});
          }
        });
      } else {
        console.debug("all logo hit cache");
      }
      this.assetLogo = logoMapCacheNew;
      this.storageService.setCacheData("AssetLogo", Array.from(logoMapCacheNew));
    }

    getTokenPair(id) {
      return this.m_mapTokenPair.get(id);
    }

    getAssetLogo(name) {
      let logo = this.assetLogo.get(name);
      if (!logo) {
        logo = {data: new Identicon(crypto.createHash('md5').update(name).digest('hex')).toString(), type: "png"};
      }
      return logo;
    }

    updateTokenPairInfo(tokenPair) {
        tokenPair.fromScInfo = this.chainInfoService.getChainInfoById(tokenPair.fromChainID);
        tokenPair.toScInfo = this.chainInfoService.getChainInfoById(tokenPair.toChainID);
        tokenPair.decimals = tokenPair.decimals || 0;
        if (tokenPair.fromScInfo && tokenPair.toScInfo) {
            try {
                this.updateTokenPairFromChainInfo(tokenPair);
                this.updateTokenPairToChainInfo(tokenPair);
                this.updateTokenPairCcHandle(tokenPair);
                return true;
            } catch (err) {
                console.error("ignore unavailable token pair %s(%s, %s<->%s): %O", tokenPair.id, tokenPair.ancestorSymbol, tokenPair.fromChainName, tokenPair.toChainName, err);
                return false; // can not get token info from chain
            }
        } else {
            console.log("ignore unsupported token pair %s(%s, %s<->%s)", tokenPair.id, tokenPair.ancestorSymbol, tokenPair.fromChainName, tokenPair.toChainName);
            return false; // lack of chain config, need to upgrade sdk
        }
    }

    updateTokenPairFromChainInfo(tokenPair) {
        tokenPair.fromChainType = tokenPair.fromScInfo.chainType;
        tokenPair.fromChainName = tokenPair.fromScInfo.chainName;
    }

    updateTokenPairToChainInfo(tokenPair) {
        tokenPair.toChainType = tokenPair.toScInfo.chainType;
        tokenPair.toChainName = tokenPair.toScInfo.chainName;
        tokenPair.toSymbol = tokenPair.symbol;
    }

    updateTokenPairCcHandle(tokenPair) {
        let fromChainInfo = tokenPair.fromScInfo;
        tokenPair.ccType = {};

        // 1 1.1 最细粒度:tokenPair级别,根据tokenId配置处理特殊tokenPair的MINT/BURN
        //       目前只处理EOS跨到WAN后的token,token在WAN<->ETH之间互跨
        //   1.2 20210324 针对FNX和CFNX特殊处理
        let tokenPairCfg = this.m_mapTokenPairCfg.get(tokenPair.id);
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
        tokenPair.ccType["BURN"] = "BurnErc20";
    }

    async updateSmgs() {
        let smgList = await this.getSmgs();
        this.webStores.assetPairs.setAssetPairs(undefined, smgList);
    }
};

module.exports = TokenPairService;