class AssetPairs {

  constructor() {
    this.assetPairList = []; // assetType => [{ accountObj }]
  }

  setAssetPairs(assetPairs, smgs) {
    let shareSmgs = smgs.map(smg => {
      return {
        id: smg.groupId,
        gpk1: smg.gpk1,
        gpk2: smg.gpk2,
        curve1: smg.curve1,
        curve2: smg.curve2,
        endTime: smg.endTime
      }
    });
    let pairList = assetPairs.map(pair => {
      return {
        assetPairId: pair.id,
        assetType: pair.ancestorSymbol,    // the ancestory symbol for this token
        fromSymbol: pair.fromSymbol,       // token symbol for fromChain
        toSymbol: pair.toSymbol,           // token symbol for toChain
        decimals: pair.decimals,           // the token decimals
        fromChainType: pair.fromChainType, // from Chain Type
        toChainType: pair.toChainType,     // to Chain Type
        fromChainName: pair.fromChainName, // from Chain Name
        toChainName: pair.toChainName,     // to Chain Name
        fromAccount: pair.fromAccount,     // from Chain token account
        toAccount: pair.toAccount,         // to Chain token account
        smgs: shareSmgs                    // active storeman groups
      }
    });
    this.assetPairList = pairList.sort(this.sortBy);
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
    return ((this.assetPairList.length > 0) && (this.assetPairList[0].smgs.length > 0));
  }
}

module.exports = AssetPairs;
