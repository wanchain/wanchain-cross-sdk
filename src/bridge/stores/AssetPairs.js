class AssetPairs {

  constructor() {
    this.assetPairList = []; // assetType => [{ accountObj }]
  }

  setAssetPairs(assetPairs, smgs) {
    let storemanGroup = smgs.map(smg => {
      return {
        id: smg.groupId,
        quota: smg.quota,
        gpk1: smg.gpk1,
        gpk2: smg.gpk2,
        curve1: smg.curve1,
        curve2: smg.curve2        
      }
    });
    let pairList = assetPairs.map(pair => {
      return {
        assetPairId: pair.id,
        assetType: pair.ancestorSymbol,    // the ancestory symbol for this token
        srcAsset: pair.fromSymbol,         // token symbol for A chain, the format is symbol@fromChainName
        dstAsset: pair.toSymbol,           // token symbol for B chain, the format is symbol@toChainName
        decimals: pair.decimals,           // the token decimals  
        fromChainType: pair.fromChainType, // from Chain Type  
        toChainType: pair.toChainType,     // to Chain Type  
        fromChainName: pair.fromChainName, // from Chain Name 
        toChainName: pair.toChainName,     // to Chain Name    
        storemanGroup                      // active storeman groups
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

  setSmgQuotaById(assetPairId, smgId, quota) {
    for (let i = 0; i < this.assetPairList.length; i++) {
      if (assetPairId == this.assetPairList[i].assetPairId) {
        for (let j = 0; j < this.assetPairList[i].storemanGroup.length; j++) { 
          if (smgId === this.assetPairList[i].storemanGroup[j].id){
            this.assetPairList[i].storemanGroup[j].quota = quota;
          }
        }
      }
    }
  }

  isReady() {
    return (this.assetPairList.length > 0);
  }
}

module.exports = AssetPairs;
