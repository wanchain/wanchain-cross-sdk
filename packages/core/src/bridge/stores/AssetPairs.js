const tool = require("../../utils/tool");

class AssetPairs {

  constructor() {
    this.assetPairList = [];
    this.smgList = [];
    this.tokens = new Set(); // not need to be classified by chain
  }

  setAssetPairs(assetPairs, smgs, configService = null) {
    this.smgList = smgs.map(smg => {
      return {
        id: smg.groupId,
        gpk1: smg.gpk1,
        gpk2: smg.gpk2,
        curve1: smg.curve1,
        curve2: smg.curve2,
        endTime: smg.endTime
      }
    });
    if (assetPairs) { // maybe only update smgs
      let pairList = assetPairs.map(pair => { // tokenPairService have chainType info but not expose to frontend
        this.tokens.add(this.getTokenAccount(pair.fromChainType, pair.fromAccount, configService));
        this.tokens.add(this.getTokenAccount(pair.toChainType, pair.toAccount, configService));
        let assetPair = {
          assetPairId: pair.id,
          assetType: pair.readableSymbol,    // the readable ancestory symbol for this token
          protocol: pair.toAccountType || "Erc20", // token protocol: Erc20, Erc721, Erc1155
          ancestorChainName: pair.ancestorChainName, // ancestor Chain Name
          fromSymbol: pair.fromSymbol,       // token symbol for fromChain
          toSymbol: pair.toSymbol,           // token symbol for toChain
          fromDecimals: pair.fromDecimals,   // from token decimals
          toDecimals: pair.toDecimals,       // to token decimals
          fromChainName: pair.fromChainName, // from Chain Name
          toChainName: pair.toChainName,     // to Chain Name
          fromAccount: pair.fromAccount,     // from Chain token account
          toAccount: pair.toAccount,         // to Chain token account
        };
        // special treatment for migrating avalanche wrapped BTC.a to original BTC.b, internal assetType is BTC but represent as BTC.a
        if (pair.id === "41") {
          assetPair.assetAlias = "BTC.a";
        }
        return assetPair;
      });
      this.assetPairList = pairList.sort(this.sortBy);
    }
  }

  sortBy(a, b) {
    if (a.assetType < b.assetType) {
        return -1;
    } else if (a.assetType > b.assetType) {
        return 1;
    }
    if (a.fromChainName < b.fromChainName) {
        return -1;
    } else if (a.fromChainName > b.fromChainName) {
        return 1;
    }
    if (a.toChainName < b.toChainName) {
        return -1;
    } else if (a.toChainName > b.toChainName) {
        return 1;
    }
    return 0;
  }

  isReady() {
    return ((this.assetPairList.length > 0) && (this.smgList.length > 0));
  }

  getTokenAccount(chainType, account, configService) {
    let native;
    if (chainType === "XRP") {
      native = tool.parseXrpTokenPairAccount(account, false)[1]; // issuer, empty for XRP coin
    } else {
      native = tool.getStandardAddressInfo(chainType, account, configService.getExtension(chainType)).native;
    }
    return native.toLowerCase();
  }

  isTokenAccount(chainType, account, extension) {
    let checkAccount = tool.getStandardAddressInfo(chainType, account, extension).native.toLowerCase();
    return this.tokens.has(checkAccount);
  }
}

module.exports = AssetPairs;
