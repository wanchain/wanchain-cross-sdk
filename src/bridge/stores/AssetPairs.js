const tool = require("../../utils/tool");

class AssetPairs {

  constructor() {
    this.assetPairList = [];
    this.smgList = [];
    this.tokens = new Set(); // not need to be classified by chain
  }

  setAssetPairs(assetPairs, smgs) {
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
      let pairList = assetPairs.map(pair => {
        this.tokens.add(this.getTokenAccount(pair.fromChainType, pair.fromAccount));
        this.tokens.add(this.getTokenAccount(pair.toChainType, pair.toAccount));
        return {
          assetPairId: pair.id,
          assetType: tool.parseTokenPairSymbol(pair.ancestorChainID, pair.ancestorSymbol), // the ancestory symbol for this token
          protocol: pair.toAccountType || "Erc20", // token protocol: Erc20, Erc721, Erc1155
          ancestorChainType: pair.ancestorChainType, // ancestor Chain Type
          ancestorChainName: pair.ancestorChainName, // ancestor Chain Name
          fromSymbol: pair.fromSymbol,       // token symbol for fromChain
          toSymbol: pair.toSymbol,           // token symbol for toChain
          decimals: pair.decimals,           // effective decimals
          fromDecimals: pair.fromDecimals,   // from token decimals
          toDecimals: pair.toDecimals,       // to token decimals
          fromChainType: pair.fromChainType, // from Chain Type
          toChainType: pair.toChainType,     // to Chain Type
          fromChainName: pair.fromChainName, // from Chain Name
          toChainName: pair.toChainName,     // to Chain Name
          fromAccount: pair.fromAccount,     // from Chain token account
          toAccount: pair.toAccount,         // to Chain token account
        }
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
    if (a.fromChainType < b.fromChainType) {
        return -1;
    } else if (a.fromChainType > b.fromChainType) {
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

  getTokenAccount(chain, account) {
    let native;
    if (chain === "XRP") {
      native = tool.parseXrpTokenPairAccount(account, false)[1]; // issuer, empty for XRP coin
    } else {
      native = tool.getStandardAddressInfo(chain, account).native;
    }
    return native.toLowerCase();
  }

  isTokenAccount(chain, account) {
    let checkAccount = tool.getStandardAddressInfo(chain, account).native.toLowerCase();
    return this.tokens.has(checkAccount);
  }
}

module.exports = AssetPairs;
