class AssetPairs {

  constructor() {
    this.assetPairList = new Array();// assetType => [{ accountObj }]
  }

  setAssetPairs(assetPair, smgs) {
    let exist = this.assetPairList.find(pair => pair.assetPairId == assetPair.id);
    if (!exist) {
      exist = {assetPairId: assetPair.id};
      this.assetPairList.push(exist);
    }
    // update
    exist.assetType = assetPair.ancestorSymbol;  // the ancestory symbol for this token
    exist.srcAsset = assetPair.fromSymbol;  // token symbol for A chain, the format is symbol@fromChainName
    exist.dstAsset = assetPair.toSymbol; // token symbol for B chain, the format is symbol@toChainName
    exist.decimals = assetPair.decimals;  // the token decimals  
    exist.fromChainType = assetPair.fromChainType;  // from Chain Type  
    exist.toChainType = assetPair.toChainType;  // to Chain Type  
    exist.fromChainName = assetPair.fromChainName;  // from Chain Name 
    exist.toChainName = assetPair.toChainName;  // to Chain Name    
    exist.storemanGroup = [];
    for (let i = 0; i < smgs.length; i++) {
      let smg = {
        id: smgs[i].groupId,
        quota: smgs[i].quota,
        gpk1: smgs[i].gpk1,
        gpk2: smgs[i].gpk2,
        curve1: smgs[i].curve1,
        curve2: smgs[i].curve2,
      };
      exist.storemanGroup.push(smg);
    }
  }

  sort() {
    this.assetPairList.sort(this.sortBy);
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
