class AssetPairs {

  constructor() {
    this.assetPairList = new Array();// assetType => [{ accountObj }]
    this.mapAssetAncestorSymbol = new Map();// assetType => ancestorSymbol
    this.mapAsset = new Map();// assetPairId => assetType
  }

  setAssetPairs(assetPair, storemanGroupListAry) {

    this.mapAsset.set(assetPair.id, assetPair);

    let bExisted = false;
    for(let i=0; i<this.assetPairList.length; i++){

      if(assetPair.id == this.assetPairList[i].assetPairId){
        this.assetPairList[i].assetPairId = assetPair.id; // the token pair id
        this.assetPairList[i].assetType = assetPair.ancestorSymbol;  // the ancestory symbol for this token
        this.assetPairList[i].srcAsset = assetPair.fromSymbol;  // token symbol for A chain, the format is symbol@fromChainName
        this.assetPairList[i].dstAsset = assetPair.toSymbol; // token symbol for B chain, the format is symbol@toChainName
        this.assetPairList[i].decimals = assetPair.decimals;  // the token decimals  
        this.assetPairList[i].fromChainType = assetPair.fromChainType;  // from Chain Type  
        this.assetPairList[i].toChainType = assetPair.toChainType;  // to Chain Type  
        this.assetPairList[i].fromChainName = assetPair.fromChainName;  // from Chain Name 
        this.assetPairList[i].toChainName = assetPair.toChainName;  // to Chain Name
        
        this.mapAssetAncestorSymbol.set(assetPair.ancestorSymbol, assetPair.ancestorSymbol);
        this.mapAssetAncestorSymbol.set(assetPair.fromSymbol, assetPair.ancestorSymbol);
        this.mapAssetAncestorSymbol.set(assetPair.toSymbol, assetPair.ancestorSymbol);

        this.assetPairList[i].storemanGroup = [];
        for(let j=0; j<storemanGroupListAry.length; j++){        
          if(5 !== parseInt(storemanGroupListAry[j].status)){
            continue;
          }
          let smgObj = {
            id: storemanGroupListAry[j].groupId,
            quota: storemanGroupListAry[j].quota,
            expireTime: storemanGroupListAry[j].expireTime,
            status: storemanGroupListAry[j].status,
            gpk1: storemanGroupListAry[j].gpk1,
            gpk2: storemanGroupListAry[j].gpk2,
            curve1: storemanGroupListAry[j].curve1,
            curve2: storemanGroupListAry[j].curve2,
          };
          
          this.assetPairList[i].storemanGroup.push(smgObj);
        }

        bExisted = true;
        break;
      }
    }

    if(!bExisted){
      let assetPairObj = {};
      assetPairObj.assetPairId = assetPair.id; 
      assetPairObj.assetType = assetPair.ancestorSymbol;
      assetPairObj.srcAsset = assetPair.fromSymbol;
      assetPairObj.dstAsset = assetPair.toSymbol;
      assetPairObj.decimals = assetPair.decimals;
      assetPairObj.fromChainType = assetPair.fromChainType;  
      assetPairObj.toChainType = assetPair.toChainType;  
      assetPairObj.fromChainName = assetPair.fromChainName;  
      assetPairObj.toChainName = assetPair.toChainName;  

      this.mapAssetAncestorSymbol.set(assetPair.ancestorSymbol, assetPair.ancestorSymbol);
      this.mapAssetAncestorSymbol.set(assetPair.fromSymbol, assetPair.ancestorSymbol);
      this.mapAssetAncestorSymbol.set(assetPair.toSymbol, assetPair.ancestorSymbol);
      
      assetPairObj.storemanGroup = new Array();      
      for(let j=0; j<storemanGroupListAry.length; j++){
        
        if(5 !== parseInt(storemanGroupListAry[j].status)){
          continue;
        }
        let smgObj = {
          id: storemanGroupListAry[j].groupId,
          quota: storemanGroupListAry[j].quota,
          expireTime: storemanGroupListAry[j].expireTime,
          status: storemanGroupListAry[j].status,
          gpk1: storemanGroupListAry[j].gpk1,
          gpk2: storemanGroupListAry[j].gpk2,
          curve1: storemanGroupListAry[j].curve1,
          curve2: storemanGroupListAry[j].curve2,
        };

        assetPairObj.storemanGroup.push(smgObj);
      }
      
      this.assetPairList.push(assetPairObj);
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

    for(let i=0; i<this.assetPairList.length; i++){
      if(assetPairId !== this.assetPairList[i].assetPairId){
        continue;
      }

      for(let j=0; j<this.assetPairList[i].storemanGroup.length; j++){ 
        if(smgId === this.assetPairList[i].storemanGroup[j].id){
          this.assetPairList[i].storemanGroup[j].quota = quota;
        }
      }
    }
  }

  isReady() {
    return (this.assetPairList.length > 0);
  }

}

module.exports = AssetPairs;
