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
        this.chainLogo = new Map(); // type => logo
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

    async getSmgs(startTime) {
        let smgList = await this.iwanBCConnector.getStoremanGroupList();
        let ts = new Date().getTime();
        console.debug("getSmgs consume %s ms", ts - startTime);
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
            let tokenPairs = await this.readTokenpairs(ts0);
            tokenPairs = tokenPairs.filter(tp => {
              if (tp.ancestorSymbol !== "EOS") {
                return this.updateTokenPairInfo(tp); // ignore unsupported token pair
              } else {
                return false; // ignore deprecated tokens
              }
            });
            let ts1 = new Date().getTime();
            let ps = [
              this.getSmgs(ts1),
              this.readTokenSymbols(tokenPairs, ts1)
            ];
            if (typeof(window) !== "undefined") {
              ps.push(this.readAssetLogos(tokenPairs, ts1));
              ps.push(this.readChainLogos(tokenPairs, ts1));
            }
            let [smgList, tokenPairMap] = await Promise.all(ps);
            let ts2 = new Date().getTime();
            console.debug("readAssetPair consume %s/%s ms", ts2 - ts1, ts2 - ts0);
            // console.debug("available tokenPairMap: %O", tokenPairMap.values());
            this.webStores.assetPairs.setAssetPairs(Array.from(tokenPairMap.values()), smgList);
            this.m_mapTokenPair = tokenPairMap;
            this.eventService.emitEvent("StoremanServiceInitComplete", true);
        } catch (err) {
            console.error("readAssetPair error: %O", err);
            this.eventService.emitEvent("StoremanServiceInitComplete", false);
        }
    }

    async readTokenpairs(startTime) {
      let uiVer = this.uiStrService.getStrByName("CacheVersion") || "0";
      let iwanVer = await this.iwanBCConnector.getTokenPairsHash();
      let verCache = this.storageService.getCacheData("Version") || {};
      console.debug({uiVer, iwanVer, verCache});
      this.forceRefresh = (verCache.ui !== uiVer);
      let tokenPairs = [];
      if ((!this.forceRefresh) && (iwanVer === verCache.iwan)) {
        tokenPairs = this.storageService.getCacheData("TokenPair") || [];
      }
      if (tokenPairs.length) { // maybe localstoreage TokenPair is cleared
        console.debug("all tokenpair hit cache");
      } else {
        let network = this.configService.getNetwork();
        let options = ((network === "mainnet") && !this.isTestMode)? {tags: ["bridge"]} : {isAllTokenPairs: true};
        tokenPairs = await this.iwanBCConnector.getTokenPairs(options);
        this.storageService.setCacheData("TokenPair", tokenPairs);
        this.storageService.setCacheData("Version", {ui: uiVer, iwan: iwanVer});
      }
      let ts = new Date().getTime();
      console.debug("readTokenpairs consume %s ms", ts - startTime);
      return tokenPairs;
    }

    async readTokenSymbols(tokenPairs, startTime) {
      // read cached symbols
      let cache = this.forceRefresh? [] : (this.storageService.getCacheData("TokenSymbol") || []);
      let tokenSymbolCacheOld = new Map(cache);
      // collect available token pairs and missed symbols
      let missSymbols = 0;
      tokenPairs.forEach(tp => {
        if (tp.fromAccount !== "0x0000000000000000000000000000000000000000") {
          let key = util.format("%s-%s-%s", tp.fromChainType, tp.fromAccount, tp.toAccountType || "Erc20");
          if (!tokenSymbolCacheOld.get(key)) {
            missSymbols++;
            tokenSymbolCacheOld.set(key, ""); // insert new symbol
            // console.debug("%s %s symbol miss cache", tp.fromChainType, tp.fromAccount);
          }
        }
      });
      // fetch missed symbols
      if (missSymbols) {
        let mc20 = new Map(), mc721 = new Map();
        Array.from(tokenSymbolCacheOld.keys()).map(tsk => {
          let [chain, account, type] = tsk.split("-");
          if (!tokenSymbolCacheOld.get(tsk)) { // inserted new symbols
            let mcMap = (type === "Erc721")? mc721 : mc20;
            let accounts = mcMap.get(chain);
            if (!accounts) {
              accounts = [];
              mcMap.set(chain, accounts);
            }
            accounts.push(account);
          }
        })
        mc20 = Array.from(mc20);
        let mcAall = mc20.concat(Array.from(mc721));
        let tokens = await Promise.all(mcAall.map(async (mc, i) => {
          let type = (i >= mc20.length)? "Erc721" : "Erc20";
          try {
            let res = await this.iwanBCConnector.getMultiTokenInfo(mc[0], mc[1], type);
            return res;
          } catch (err) {
            console.error("get %s %s tokens %s error: %O", mc[0], type, mc[1], err);
            return {};
          }
        }));
        tokens.forEach((item, i) => {
          let type = (i >= mc20.length)? "Erc721" : "Erc20";
          let chain = mcAall[i][0];
          for (let k in item) {
            let symbol = item[k].symbol;
            let key = util.format("%s-%s-%s", chain, k, type);
            if (symbol) {
              tokenSymbolCacheOld.set(key, symbol);
            } else {
              console.error("%s getTokenInfo none", key);
            }
          }
        });
      } else {
        console.debug("all symbol hit cache");
      }
      let ts = new Date().getTime();
      console.debug("readTokenSymbols consume %s ms", ts - startTime);
      // collect available token pairs and construct symbol new cache
      let tokenPairMap = new Map();
      let tokenSymbolCacheNew = new Map(); // may be less than old
      tokenPairs.map(tp => { // update fromSymbol
        if (tp.fromAccount === "0x0000000000000000000000000000000000000000") {
          tp.fromSymbol = tp.ancestorSymbol;
          tokenPairMap.set(tp.id, tp);
        } else {
          let key = util.format("%s-%s-%s", tp.fromChainType, tp.fromAccount, tp.toAccountType || "Erc20");
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
      this.tokenSymbol = tokenSymbolCacheNew;
      this.storageService.setCacheData("TokenSymbol", Array.from(tokenSymbolCacheNew));
      return tokenPairMap;
    }

    async readAssetLogos(tokenPairs, startTime) {
      let assetMap = new Map();
      let tokenMap = new Map();
      let accountSet = new Set();
      tokenPairs.forEach(tp => {
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
        let logos = await this.iwanBCConnector.getRegisteredTokenLogo({tokenScAddr, isAllTokenTypes:true});
        // console.debug({logos});
        logos.forEach(v => {
          let asset = tokenMap.get(v.chainType + "-" + v.tokenScAddr);
          if (asset) {
            logoMapCacheNew.set(asset, {data: v.iconData, type: v.iconType});
          }
        });
      } else {
        console.debug("all asset logo hit cache");
      }
      let ts = new Date().getTime();
      console.debug("readAssetLogos consume %s ms", ts - startTime);
      this.assetLogo = logoMapCacheNew;
      this.storageService.setCacheData("AssetLogo", Array.from(logoMapCacheNew));
    }

    async readChainLogos(tokenPairs, startTime) {
      let chainSet = new Set();
      let newChains = [];
      tokenPairs.forEach(tp => {
        chainSet.add(tp.fromChainType);
        chainSet.add(tp.toChainType);
      });
      let cache = this.forceRefresh? [] : (this.storageService.getCacheData("ChainLogo") || []);
      let logoMapCacheOld = new Map(cache);
      let logoMapCacheNew = new Map();
      chainSet.forEach(k => {
        let logo = logoMapCacheOld.get(k);
        if (logo) {
          logoMapCacheNew.set(k, logo);
        } else {
          newChains.push(k);
          // console.debug("%s chain logo miss cache", k);
        }
      });
      if (newChains.length) {
        let logos = [];
        if ((newChains.length * 3) > chainSet.size) {
          logos = await this.iwanBCConnector.getRegisteredChainLogo();
        } else {
          await Promise.all(newChains.map(async (chainType) => {
            let result = await this.iwanBCConnector.getRegisteredChainLogo({chainType});
            logos = logos.concat(result);
          }))
        }
        logos.forEach(v => {
          if (chainSet.has(v.chainType)) {
            logoMapCacheNew.set(v.chainType, {data: v.iconData, type: v.iconType});
          }
        });
      } else {
        console.debug("all chain logo hit cache");
      }
      let ts = new Date().getTime();
      console.debug("readChainLogos consume %s ms", ts - startTime);
      this.chainLogo = logoMapCacheNew;
      this.storageService.setCacheData("ChainLogo", Array.from(logoMapCacheNew));
    }

    getTokenPair(id) {
      return this.m_mapTokenPair.get(id);
    }

    getAssetLogo(name) {
      let logo = this.assetLogo.get(name);
      if (!logo) {
        logo = {data: new Identicon(crypto.createHash('md5').update(name || "").digest('hex')).toString(), type: "png"};
      }
      return logo;
    }

    getChainLogo(chainType) {
      let logo = this.chainLogo.get(chainType);
      if (!logo) {
        logo = {data: new Identicon(crypto.createHash('md5').update(chainType || "").digest('hex')).toString(), type: "png"};
      }
      return logo;
    }

    updateTokenPairInfo(tokenPair) {
        tokenPair.fromScInfo = this.chainInfoService.getChainInfoById(tokenPair.fromChainID);
        tokenPair.toScInfo = this.chainInfoService.getChainInfoById(tokenPair.toChainID);
        if (tokenPair.fromScInfo && tokenPair.toScInfo) {
            tokenPair.toDecimals = tokenPair.decimals || 0; // erc721 has no decimals
            tokenPair.fromDecimals = tokenPair.fromDecimals || tokenPair.toDecimals;
            tokenPair.decimals = (Number(tokenPair.fromDecimals) < Number(tokenPair.toDecimals))? tokenPair.fromDecimals : tokenPair.toDecimals;
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
                // 祖先链是其他链的coin或token,在非祖先链之间转移,双向都是userBurn
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