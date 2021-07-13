class CrossChainTask {

  constructor() {
    this.ccTaskData = {
      ccTaskId: 0,  // the unique id for convert task
      assetPairId: '', // the token pair id of this convert task
      assetType: '', // the token ancestorySymbol
      assetTypeTag: '', // the tags for this convert task, the format is fromTokenSymbol <=> toTokenSymbol
      convertType: '', // the value is "MINT" or "BURN", used by web server 
      srcAsset: '', // from token symbol
      dstAsset: '',  // to token symbol
      assetSMGs: [], // work storemanGroup for this token pair
      storemanGroup: '', // work storemanGroup for this token pair
      storemanQuota: '', // work storemanGroup quota
      fromAccount: '', // the from account
      destAccount: '', // the to account
      amount: '',  // convert amount
      status: '',
      stepData: [],
      lockHash: '',
      redeemHash: '',
      stepNums: 0, // convert steps num
      minTokenMintValue: '',
      fromAccountBalance: '',
      operateFee: '', // add operate fee on 2021.0105 
      networkFee: '',
      bDestinationTag: false, // adapted to BTC/XRP crosschain task on 2021.0111 
      tagId: '', // adapted to BTC/XRP crosschain task on 2021.0111
    };
  }

  setTaskAssetPair(jsonTaskAssetPair) {
    this.ccTaskData.assetPairId = jsonTaskAssetPair.assetPairId;
    this.ccTaskData.srcAsset = jsonTaskAssetPair.srcAsset;
    this.ccTaskData.dstAsset = jsonTaskAssetPair.dstAsset;

    if(jsonTaskAssetPair.bMintType){
      this.ccTaskData.convertType = "MINT";
    }else{
      this.ccTaskData.convertType = "BURN";
    }
    this.ccTaskData.assetType = jsonTaskAssetPair.assetType;
    this.ccTaskData.fromChainType = jsonTaskAssetPair.fromChainType;
    this.ccTaskData.toChainType = jsonTaskAssetPair.toChainType;
    this.ccTaskData.assetTypeTag = jsonTaskAssetPair.srcAsset + ' -> ' +jsonTaskAssetPair.dstAsset;
    
    this.ccTaskData.assetSMGs = jsonTaskAssetPair.assetSMGs;
    this.ccTaskData.storemanGroup = jsonTaskAssetPair.storemanGroup;
    this.ccTaskData.storemanQuota = jsonTaskAssetPair.storemanQuota;
  };

  setStoremanGroup(storemanGroup, quota) {
    this.ccTaskData.storemanGroup = storemanGroup;
    this.ccTaskData.storemanQuota = quota;
  }

  setTaskAccountAddress(accountTags, addr) {
    if('From' === accountTags){
      this.ccTaskData.fromAccount = addr;
    }else{
      this.ccTaskData.destAccount = addr;
    }
  };

  setMinTokenMintValue(minValue) {
    this.ccTaskData.minTokenMintValue = minValue;
  };

  setFromAccountBalance(balance) {
    this.ccTaskData.fromAccountBalance = balance;
  };

  setOperateFee(operateFee) {
    this.ccTaskData.operateFee = operateFee; //add operate fee on 2021.0105 
  };

  setNetworkFee(networkFee) {
    this.ccTaskData.networkFee = networkFee; //add operate fee on 2021.0105 
  };

  setDestinationTag(bDestinationTag) {
    this.ccTaskData.bDestinationTag = bDestinationTag; // adapted to BTC/XRP crosschain task on 2021.0111  
    if(true === bDestinationTag){
      this.ccTaskData.fromAccount = '';
    }
  };

  setTagId(tagId) {
    this.ccTaskData.tagId = tagId; // adapted to BTC/XRP crosschain task on 2021.0111  
  };

  setTaskAmount(amount) {
    this.ccTaskData.amount = amount;
  };

  setCCTaskID(ccTaskId) {
    this.ccTaskData.ccTaskId = ccTaskId;
  };

  setTaskStepNums(stepNums) {
    this.ccTaskData.stepNums = stepNums;
  };

  clearCrossChainTask() {
    this.ccTaskData = {};
  };

}

module.exports = CrossChainTask;
