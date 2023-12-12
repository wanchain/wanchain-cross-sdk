"use strict";

const crypto = require('crypto');
const Identicon = require('identicon.js');
const tool = require('../../utils/tool');
const axios = require("axios");

class TokenPairService {
    constructor() {
        this.m_iwanConnected = false;
        this.m_mapTokenPair = new Map(); // tokenPairId => tokenPair
        this.m_mapTokenPairCfg = new Map(); // tokenPairId => tokenPairConfig
        this.assetLogo = new Map(); // name => logo
        this.chainLogo = new Map(); // type => logo
        this.storageService = null; // init after token pair service
        this.forceRefresh = false;
        this.multiChainOrigToken = new Map();
        this.tokenIssuer = new Map();
        this.chainName2Type = new Map(); // internal use chainType and frontend use chainName
        this.assetAlias2Type = new Map(); // for logo
        this.fromChainAssets = new Map(); // protocol => chainType => assetName => tokenAccount
    }

    async init(frameworkService, options) {
        try {
            this.isTestMode = options.isTestMode || false;
            this.crossAssets = (options.crossAssets || []).map(v => v.toLowerCase());
            this.crossChains = (options.crossChains || []).map(v => v.toLowerCase());
            this.crossProtocols = (options.crossProtocols || []).map(v => v.toLowerCase());
            this.crossTypes = (options.crossTypes || []).map(v => v.toLowerCase());
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
            console.error("TokenPairService init error: %O", err);
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
        let ts = Date.now();
        console.debug("getSmgs %d consume %s ms", smgList.length, ts - startTime);
        let workingList = [];
        for (let i = 0; i < smgList.length; i++) {
            let smg = smgList[i];
            let curTime = Date.now();
            let startTime = smg.startTime * 1000;
            let endTime = smg.endTime * 1000;
            if ((smg.status == 5) && (curTime > startTime) && (curTime < endTime)) {
                workingList.push(smg);
            }
        }
        if (workingList.length > 0) {
            workingList.sort((a, b) => (b.endTime - b.startTime) - (a.endTime - a.startTime));
            return workingList;
        } else {
            throw new Error("Storeman unavailable");
        }
    }

    async readAssetPair() {
        this.storageService = this.frameworkService.getService("StorageService");
        try {
            let ts0 = Date.now();
            let tokenPairMap = new Map();
            let [tokenPairs] = await Promise.all([
              this.readTokenpairs(ts0),
              this.readMultiChainOrigToken(ts0),
              this.readTokenIssuer(ts0)
            ]);
            tokenPairs = tokenPairs.filter(tp => {
              if ((tp.ancestorSymbol !== "EOS") && !["66"].includes(tp.id)) { // ignore deprecated tokenpairs
                if (this.updateTokenPairInfo(tp)) { // ignore unsupported token pair
                  if (this.checkCustomization(tp)) {
                    tokenPairMap.set(tp.id, tp);
                    return true;
                  }
                }
              }
              return false;
            });
            let ts1 = Date.now();
            let ps = [
              this.getSmgs(ts1)
            ];
            if (typeof(window) !== "undefined") {
              ps.push(this.readAssetLogos(tokenPairs, ts1));
              ps.push(this.readChainLogos(tokenPairs, ts1));
            }
            let [smgList] = await Promise.all(ps);
            let ts2 = Date.now();
            console.debug("readAssetPair consume %s/%s ms", ts2 - ts1, ts2 - ts0);
            // console.debug("available tokenPairMap: %O", tokenPairMap.values());
            this.webStores.assetPairs.setAssetPairs(Array.from(tokenPairMap.values()), smgList, this.configService);
            this.m_mapTokenPair = tokenPairMap;
            this.eventService.emitEvent("StoremanServiceInitComplete", true);
        } catch (err) {
            console.error("readAssetPair error: %O", err);
            this.eventService.emitEvent("StoremanServiceInitComplete", false);
        }
    }

    checkCustomization(tp) {
      if (this.crossProtocols.length && !this.crossProtocols.includes(tp.protocol.toLowerCase())) {
        return false;
      }
      if (this.crossAssets.length && !this.crossAssets.includes(tp.readableSymbol.toLowerCase())) {
        return false;
      }
      if (this.crossChains.length) {
        let chains = [tp.ancestorChainType, tp.ancestorChainName, tp.fromChainType, tp.fromChainName, tp.toChainType, tp.toChainName]; 
        for (let chain of chains) {
          if (!this.crossChains.includes(chain.toLowerCase())) {
            return false;
          }
        }
      }
      if (this.crossTypes.length) {
        let crossType = "other";
        if (tp.bridge === "Circle") {
          crossType = "cctp";
        } else if (tp.fromIsNative && tp.toIsNative) {
          crossType = "xflows";
        }
        if (!this.crossTypes.includes(crossType)) {
          return false;
        }
      }
      return true;
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
        let options;
        if (network === "mainnet") {
          options = this.isTestMode? {tags: ["bridgeBeta"]} : {tags: ["bridge"]};
        } else {
          options = {isAllTokenPairs: true};
        }
        tokenPairs = await this.iwanBCConnector.getTokenPairs(options);
        this.storageService.setCacheData("TokenPair", tokenPairs);
        this.storageService.setCacheData("Version", {ui: uiVer, iwan: iwanVer});
      }
      let ts = Date.now();
      console.debug("readTokenpairs %d consume %s ms", tokenPairs.length, ts - startTime);
      return tokenPairs;
    }

    async readMultiChainOrigToken(startTime) {
      let origTokens = await this.iwanBCConnector.getRegisteredMultiChainOrigToken();
      let map = new Map();
      origTokens.forEach(t => {
        let key = t.chainType + "-" + t.tokenScAddr;
        map.set(key, t);
      })
      this.multiChainOrigToken = map;
      let ts = Date.now();
      console.debug("readMultiChainOrigToken %d consume %s ms", origTokens.length, ts - startTime);
    }

    async readTokenIssuer(startTime) {
      let tokenIssuers = await this.iwanBCConnector.getRegisteredTokenIssuer();
      let map = new Map();
      tokenIssuers.forEach(t => {
        let key = t.chainType + "-" + t.tokenScAddr;
        map.set(key, t);
      })
      this.tokenIssuer = map;
      let ts = Date.now();
      console.debug("readTokenIssuer %d consume %s ms", tokenIssuers.length, ts - startTime);
    }

    async readAssetLogos(tokenPairs, startTime) {
      let assetMap = new Map();
      let tokenMap = new Map();
      let accountSet = new Set();
      tokenPairs.forEach(tp => {
        let chainInfo = this.chainInfoService.getChainInfoById(tp.ancestorChainID);
        assetMap.set(tp.readableSymbol + "_" + tp.protocol.toLowerCase(), {chain: chainInfo.chainType, address: tp.ancestorAccount});
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
      let ts = Date.now();
      console.debug("readAssetLogos %d consume %s ms", tokenScAddr.length, ts - startTime);
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
      let ts = Date.now();
      console.debug("readChainLogos %d consume %s ms", newChains.length, ts - startTime);
      this.chainLogo = logoMapCacheNew;
      this.storageService.setCacheData("ChainLogo", Array.from(logoMapCacheNew));
    }

    getTokenPair(id) {
      return this.m_mapTokenPair.get(id);
    }

    getAssetLogo(name, protocol) {
      let assetName = this.assetAlias2Type.get(name) || name;
      protocol = protocol? protocol.toLowerCase() : "erc20";
      let key = assetName + "_" + protocol;
      let logo = this.assetLogo.get(key);
      if (!logo) {
        logo = {data: new Identicon(crypto.createHash('md5').update(key).digest('hex')).toString(), type: "png"};
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

    setExtraInfo(tokenPair) { // special treatment for frontend
      // assetAlias only change ui asset symbol, do not affect sdk, such as fee unit
      // readableSymbol affect both ui and sdk
      let direction = "both";
      if (tokenPair.id === "41") { // migrating avalanche wrapped BTC.a to original BTC.b, internal assetType is BTC but represent as BTC.a
        tokenPair.assetAlias = "BTC.a";
        this.assetAlias2Type.set("BTC.a", "BTC");
        direction = "t2f";
      } if (tokenPair.id === "14") { // migrating ethereum wrapped wanBTC to WBTC, internal assetType is BTC but represent as wanBTC
        tokenPair.assetAlias = "wanBTC";
        this.assetAlias2Type.set("wanBTC", "BTC");
        direction = "t2f";
      } if (tokenPair.id === "454") { // migrating arbitrum wrapped USDC.e to USDC, internal assetType is USDC but represent as USDC.e
        tokenPair.assetAlias = "USDC.e";
        tokenPair.fromSymbol = "USDC.e";
        this.assetAlias2Type.set("USDC.e", "USDC");
        direction = "f2t"; // fromChain and toChain are the same, only support f2t
      }
      tokenPair.direction = direction;
    }

    customizeSymbol(symbol) { // special treatment for frontend
      if (symbol === "Djed_testMicroUSD") {
        return "Djed Test USD";
      } else if (symbol === "GEROV2") {
        return "GERO";
      } else {
        return symbol;
      }
    }

    updateTokenPairInfo(tokenPair) {
        let ancestorChainInfo = this.chainInfoService.getChainInfoById(tokenPair.ancestorChainID);
        tokenPair.fromScInfo = this.chainInfoService.getChainInfoById(tokenPair.fromChainID);
        tokenPair.toScInfo = this.chainInfoService.getChainInfoById(tokenPair.toChainID);
        if (ancestorChainInfo && tokenPair.fromScInfo && tokenPair.toScInfo) {
            // (xrp) ancestorSymbol keep original format for iwan api
            tokenPair.readableSymbol = this.customizeSymbol(tool.parseTokenPairSymbol(tokenPair.ancestorChainID, tokenPair.ancestorSymbol));
            tokenPair.ancestorChainType = ancestorChainInfo.chainType;
            tokenPair.ancestorChainName = ancestorChainInfo.chainName;
            this.chainName2Type.set(tokenPair.ancestorChainName, tokenPair.ancestorChainType);
            tokenPair.toDecimals = tokenPair.decimals || 0; // erc721 has no decimals
            tokenPair.fromDecimals = tokenPair.fromDecimals || tokenPair.toDecimals;
            tokenPair.protocol = tokenPair.toAccountType || "Erc20"; // fromAccountType always be the same as toAccountType
            this.setExtraInfo(tokenPair);
            try {
                this.updateTokenPairFromChainInfo(tokenPair);
                this.updateTokenPairToChainInfo(tokenPair);
                this.updateTokenPairCcHandle(tokenPair);
                this.updateChainAssets(tokenPair);
                return true;
            } catch (err) {
                console.error("ignore unavailable token pair %s(%s, %s<->%s): %O", tokenPair.id, tokenPair.ancestorSymbol, tokenPair.fromChainName, tokenPair.toChainName, err);
                return false; // can not get token info from chain
            }
        } else {
            console.log("ignore unsupported token pair %s(%s, %s<->%s)", tokenPair.id, tokenPair.ancestorSymbol, tokenPair.fromChainID, tokenPair.toChainID);
            return false; // lack of chain config, need to upgrade sdk
        }
    }

    updateTokenPairFromChainInfo(tokenPair) {
        tokenPair.fromChainType = tokenPair.fromScInfo.chainType;
        tokenPair.fromChainName = tokenPair.fromScInfo.chainName;
        this.chainName2Type.set(tokenPair.fromChainName, tokenPair.fromChainType);
        tokenPair.fromSymbol = this.customizeSymbol(tool.parseTokenPairSymbol(tokenPair.fromChainID, tokenPair.fromSymbol));
        tokenPair.fromIsNative = this.checkNativeToken(tokenPair.bridge, tokenPair.ancestorChainType, tokenPair.fromChainType, tokenPair.fromAccount);
        let issuer = this.tokenIssuer.get(tokenPair.fromChainType + "-" + tokenPair.fromAccount);
        if (issuer) {
          tokenPair.fromIssuer = {
            issuer: issuer.issuer || "",
            isNativeCoin: issuer.isNativeCoin || false
          };
        }
    }

    updateTokenPairToChainInfo(tokenPair) {
        tokenPair.toChainType = tokenPair.toScInfo.chainType;
        tokenPair.toChainName = tokenPair.toScInfo.chainName;
        this.chainName2Type.set(tokenPair.toChainName, tokenPair.toChainType);
        tokenPair.toSymbol = this.customizeSymbol(tool.parseTokenPairSymbol(tokenPair.toChainID, tokenPair.symbol));
        tokenPair.toIsNative = this.checkNativeToken(tokenPair.bridge, tokenPair.ancestorChainType, tokenPair.toChainType, tokenPair.toAccount);
        let issuer = this.tokenIssuer.get(tokenPair.toChainType + "-" + tokenPair.toAccount);
        if (issuer) {
          tokenPair.toIssuer = {
            issuer: issuer.issuer || "",
            isNativeCoin: issuer.isNativeCoin || false
          };
        }
    }

    checkNativeToken(bridge, ancestorChainType, chainType, tokenAccount) {
      if (bridge) { // all other bridge token is native
        return true;
      }
      if (ancestorChainType === chainType) { // coin or orig token
        return true;
      }
      let key = chainType + "-" + tokenAccount;
      let origToken = this.multiChainOrigToken.get(key);
      if (origToken) { // multichain orig token
        return true;
      }
      return false;
    }

    updateTokenPairCcHandle(tokenPair) {
        let fromChainInfo = tokenPair.fromScInfo;
        let toChainInfo = tokenPair.toScInfo;
        tokenPair.ccType = {};

        // other bridge
        if (tokenPair.bridge) {
          let bridgeKey = tokenPair.bridge + "Bridge";
          if (fromChainInfo[bridgeKey] && toChainInfo[bridgeKey]) {
            tokenPair.ccType["MINT"] = bridgeKey + "Deposit";
            tokenPair.ccType["BURN"] = bridgeKey + "Deposit";
          } else {
            throw new Error(bridgeKey + " unavailable");
          }
          return;
        }

        // 1、config single tokenPair, only for wanEOS between wanchain and ethereum 
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

        // 2、common rule for tokenPairs
        // 2.1 MINT direction
        if (fromChainInfo.mintFromChainHandle) {
            // mintFromChainHandle is used for non-EVM to EVM, include coin and token
            tokenPair.ccType["MINT"] = fromChainInfo.mintFromChainHandle;
        } else if (tokenPair.fromAccount === "0x0000000000000000000000000000000000000000") {
            // coin
            tokenPair.ccType["MINT"] = "MintCoin";
        } else if (tokenPair.fromChainID === tokenPair.ancestorChainID) {
            // orig token
            tokenPair.ccType["MINT"] = "MintErc20";
        } else { // EVM coin and token, fromAccount maybe coin or orignal token which has different chain from ancestor
            tokenPair.ccType["MINT"] = this.getTokenBurnHandler(tokenPair, "MINT");
        }

        // 2.2 BURN direction
        if (toChainInfo.burnFromChainHandle) {
            // burn token from non-EVM chain, such as Cardano
            tokenPair.ccType["BURN"] = toChainInfo.burnFromChainHandle;
        } else if (tokenPair.toAccount === "0x0000000000000000000000000000000000000000") {
            // cross coin between ETH layer 2
            tokenPair.ccType["BURN"] = "MintCoin";
        } else if (tokenPair.toChainID === tokenPair.ancestorChainID) {
            // orig token, should not be configured like this
            tokenPair.ccType["BURN"] = "MintErc20";
        } else { // token which has different chain from ancestor
            tokenPair.ccType["BURN"] = this.getTokenBurnHandler(tokenPair, "BURN");
        }
    }

    updateChainAssets(tokenPair) {
      let assetName = tokenPair.assetAlias || tokenPair.readableSymbol;
      // protocol
      let protocol = this.fromChainAssets.get(tokenPair.protocol);
      if (!protocol) {
        protocol = new Map();
        this.fromChainAssets.set(tokenPair.protocol, protocol);
      }
      // fromChain
      if (tokenPair.direction !== "t2f") {
        let chain = protocol.get(tokenPair.fromChainType);
        if (!chain) {
          chain = new Map();
          protocol.set(tokenPair.fromChainType, chain);
        }
        chain.set(assetName, {symbol: tokenPair.fromSymbol, address: tokenPair.fromAccount, decimals: tokenPair.fromDecimals, protocol: tokenPair.protocol});
      }
      // toChain
      if (tokenPair.direction !== "f2t") {
        if (tokenPair.toChainType !== tokenPair.fromChainType) { // USDC.e
          let chain = protocol.get(tokenPair.toChainType);
          if (!chain) {
            chain = new Map();
            protocol.set(tokenPair.toChainType, chain);
          }
          chain.set(assetName, {symbol: tokenPair.toSymbol, address: tokenPair.toAccount, decimals: tokenPair.toDecimals, protocol: tokenPair.protocol});
        }
      }
    }

    // for internal call
    getTokenBurnHandler(tokenPair, direction) {
      let chainType = (direction === "MINT")? tokenPair.fromChainType : tokenPair.toChainType;
      let tokenAccount = (direction === "MINT")? tokenPair.fromAccount : tokenPair.toAccount;
      let key = chainType + "-" + tokenAccount;
      let origToken = this.multiChainOrigToken.get(key);
      if (origToken) {
        // if (direction === "BURN") {
        //   console.debug("tokenpair %s %s(%s<-%s) handler is MintErc20", tokenPair.id, origToken.symbol, tokenPair.fromChainType, tokenPair.toChainType);
        // }
        return "MintErc20";
      } else {
        // if (direction === "MINT") {
        //   console.debug("tokenpair %s %s(%s->%s) handler is BurnErc20", tokenPair.id, tokenPair.fromSymbol, tokenPair.fromChainType, tokenPair.toChainType);
        // }
        return "BurnErc20";
      }
    }

    // for external call
    getTokenEventType(tokenPairId, direction) {
      let tokenPair = this.getTokenPair(tokenPairId);
      let chainType = (direction === "MINT")? tokenPair.toChainType : tokenPair.fromChainType;
      let tokenAccount = (direction === "MINT")? tokenPair.toAccount : tokenPair.fromAccount;
      let key = chainType + "-" + tokenAccount;
      let origToken = this.multiChainOrigToken.get(key);
      if (origToken || (tokenAccount === tokenPair.ancestorAccount)) { // original token or coin
        return (tokenPair.protocol === "Erc20")? "BURN" : "BURNNFT"; // release
      } else {
        return (tokenPair.protocol === "Erc20")? "MINT" : "MINTNFT";
      }
    }

    async updateSmgs() {
      let smgList = await this.getSmgs();
      this.webStores.assetPairs.setAssetPairs(undefined, smgList);
    }

    getChainType(chainName) {
      return this.chainName2Type.get(chainName);
    }

    getChainAssets(chainType, options) {
      let assets = {};
      options.protocols.forEach(p => {
        let protocol = this.fromChainAssets.get(p);
        if (protocol) {
          let chain = protocol.get(chainType);
          if (chain) {
            chain.forEach((tokenInfo, asset) => assets[asset] = tokenInfo);
          }
        }
      })
      return assets;
    }

    async getAssetPrice(symbols) {
      let prices = {};
      try {
        let origSymbols = new Set(), alias = {};
        symbols.forEach(v => {
          let aliasType = this.assetAlias2Type.get(v);
          if (aliasType) {
            alias[v] = aliasType;
          } else {
            origSymbols.add(v);
          }
        });
        let ids = await this.iwanBCConnector.getRegisteredCoinGecko({symbol: Array.from(origSymbols)});
        let symbol2id = {};
        origSymbols.forEach(origSymbol => {
          let idInfo = ids.find(v => v.symbol.toLowerCase() === origSymbol.toLowerCase());
          symbol2id[origSymbol] = idInfo? idInfo.id : "";
        });
        for (let aliasName in alias) {
          symbol2id[aliasName] = symbol2id[alias[aliasName]] || "";
        }
        let res = await axios.get("https://api.coingecko.com/api/v3/simple/price", {params: {ids: ids.map(v => v.id).toString(), vs_currencies: 'usd'}});
        if (res && res.data) {
          for (let symbol in symbol2id) {
            let id = symbol2id[symbol];
            if (res.data[id] && res.data[id]['usd']) {
              prices[symbol] = res.data[id]['usd'].toString();
            } else {
              prices[symbol] = "0";
            }
          }
        }
        // console.log("get %s price: %O", symbols, prices);
      } catch (e) {
        console.log("get %s price error: %O", symbols, e);
      }
      return prices;
    }
};

module.exports = TokenPairService;