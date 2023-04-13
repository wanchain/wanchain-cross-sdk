const tool = require("../../utils/tool");

class AssetPairs {

  constructor() {
    this.assetPairList = [];
    this.smgList = [];
    this.tokens = new Set(); // not need to be classified by chain
  }

  setAssetPairs(tokenPairs, smgs, configService = null) {
    this.smgList = smgs.map(smg => {
      return {
        id: smg.groupId,
        name: tool.ascii2letter(smg.groupId),
        gpk1: smg.gpk1,
        gpk2: smg.gpk2,
        curve1: smg.curve1,
        curve2: smg.curve2,
        endTime: smg.endTime
      }
    });
    if (tokenPairs) { // maybe only update smgs
      let pairList = tokenPairs.map(pair => { // tokenPairService have chainType info but not expose to frontend
        this.tokens.add(this.getTokenAccount(pair.fromChainType, pair.fromAccount, configService).toLowerCase());
        this.tokens.add(this.getTokenAccount(pair.toChainType, pair.toAccount, configService).toLowerCase());
        let assetPair = {
          assetPairId: pair.id,
          assetType: pair.readableSymbol,    // the readable ancestory symbol for this token
          assetAlias: pair.assetAlias,
          protocol: pair.protocol,           // token protocol: Erc20, Erc721, Erc1155
          ancestorChainName: pair.ancestorChainName, // ancestor Chain Name
          fromSymbol: pair.fromSymbol,       // token symbol for fromChain
          toSymbol: pair.toSymbol,           // token symbol for toChain
          fromDecimals: pair.fromDecimals,   // from token decimals
          toDecimals: pair.toDecimals,       // to token decimals
          fromChainName: pair.fromChainName, // from Chain Name
          toChainName: pair.toChainName,     // to Chain Name
          fromAccount: pair.fromAccount,
          toAccount: pair.toAccount,
          fromIsNative: pair.fromIsNative,   // is fromAccount is coin or native token
          toIsNative: pair.toIsNative,       // is toAccount is coin or native token
          fromIssuer: pair.fromIssuer,       // issuer of fromAccount, only for xFlow
          toIssuer: pair.toIssuer            // issuer of toAccount, only for xFlow
        };
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
    if (chainType === "XRP") {
      return tool.parseXrpTokenPairAccount(account, false)[1]; // issuer, empty for XRP coin
    } else { // ADA chain is policyId.name, not address
      return tool.getStandardAddressInfo(chainType, account, configService.getExtension(chainType)).native;
    }
  }

  isTokenAccount(chainType, account, extension) {
    let checkAccount = tool.getStandardAddressInfo(chainType, account, extension).native.toLowerCase();
    return this.tokens.has(checkAccount);
  }
}

module.exports = AssetPairs;
