class CrossChainTask {

  constructor() {
    this.ccTaskData = {
      ccTaskId: 0,  // the unique id for convert task
      assetPairId: '', // the token pair id of this convert task
      assetType: '', // the token ancestorySymbol
      convertType: '', // the value is "MINT" or "BURN", used by web server 
      fromSymbol: '', // fromChain token symbol
      toSymbol: '', // toChain token symbol
      fromChainType: '', // fromChain type
      toChainType: '', // toChain type
      fromChainName: '',  // fromChain name
      toChainName: '', // toChain name
      smg: null, // storemanGroup for this task
      fromAccount: '', // the from account
      toAccount: '', // the to account
      amount: '',  // convert amount
      status: '',
      stepData: [],
      lockHash: '',
      redeemHash: '',
      stepNums: 0, // convert steps num
      fromAccountBalance: '',
      fee: null, 
      isOtaTx: false, // adapted to BTC/XRP crosschain task on 2021.0111 
      ota: null, // adapted to BTC/XRP crosschain task on 2021.0111
    };
  }

  setTaskAssetPair(jsonTaskAssetPair) {
    this.ccTaskData.assetPairId = jsonTaskAssetPair.assetPairId;
    this.ccTaskData.assetType = jsonTaskAssetPair.assetType;
    this.ccTaskData.convertType = jsonTaskAssetPair.direction;
    this.ccTaskData.fromSymbol = jsonTaskAssetPair.fromSymbol;
    this.ccTaskData.toSymbol = jsonTaskAssetPair.toSymbol;
    this.ccTaskData.fromChainType = jsonTaskAssetPair.fromChainType;
    this.ccTaskData.toChainType = jsonTaskAssetPair.toChainType;
    this.ccTaskData.fromChainName = jsonTaskAssetPair.fromChainName;
    this.ccTaskData.toChainName = jsonTaskAssetPair.toChainName;    
    this.ccTaskData.smg = jsonTaskAssetPair.smg;
  };

  setTaskAccountAddress(accountTags, addr) {
    if('From' === accountTags){
      this.ccTaskData.fromAccount = addr;
    }else{
      this.ccTaskData.toAccount = addr;
    }
  };

  setFromAccountBalance(balance) {
    this.ccTaskData.fromAccountBalance = balance;
  };

  setFee(fee) {
    this.ccTaskData.fee = fee;
  };

  setOtaTx(isOtaTx) {
    this.ccTaskData.isOtaTx = isOtaTx; // adapted to BTC/XRP crosschain task on 2021.0111  
    if (isOtaTx) {
      this.ccTaskData.fromAccount = '';
    }
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
}

module.exports = CrossChainTask;
