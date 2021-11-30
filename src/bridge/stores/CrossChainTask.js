class CrossChainTask {

  constructor(taskId) {
    this.ccTaskData = {
      ccTaskId: taskId, // the unique id for convert task
      assetPairId: '', // the token pair id of this convert task
      assetType: '', // the token ancestorySymbol
      protocol: '', // token protocol, erc20 or erc721
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
      decimals: 0,
      sentAmount: '', // actually sent amount
      receivedAmount: '', // final received amount
      status: '',
      stepData: [],
      lockHash: '',
      redeemHash: '',
      stepNums: 0, // convert steps num
      fromAccountBalance: '',
      fee: null, 
      isOtaTx: false, // adapted to BTC/XRP crosschain task on 2021.0111 
      ota: null, // adapted to BTC/XRP crosschain task on 2021.0111
      errInfo: ''
    };
  }

  setTaskAssetPair(jsonTaskAssetPair) {
    this.ccTaskData.assetPairId = jsonTaskAssetPair.assetPairId;
    this.ccTaskData.assetType = jsonTaskAssetPair.assetType;
    this.ccTaskData.protocol = jsonTaskAssetPair.protocol;
    this.ccTaskData.convertType = jsonTaskAssetPair.direction;
    this.ccTaskData.fromSymbol = jsonTaskAssetPair.fromSymbol;
    this.ccTaskData.toSymbol = jsonTaskAssetPair.toSymbol;
    this.ccTaskData.fromChainType = jsonTaskAssetPair.fromChainType;
    this.ccTaskData.toChainType = jsonTaskAssetPair.toChainType;
    this.ccTaskData.fromChainName = jsonTaskAssetPair.fromChainName;
    this.ccTaskData.toChainName = jsonTaskAssetPair.toChainName;    
    this.ccTaskData.smg = jsonTaskAssetPair.smg;
  }

  setTaskAccounts(fromAccount, toAccount) {
    this.ccTaskData.fromAccount = fromAccount;
    this.ccTaskData.toAccount = toAccount;
  }

  setFromAccountBalance(balance) {
    this.ccTaskData.fromAccountBalance = balance;
  }

  setFee(fee) {
    this.ccTaskData.fee = fee;
  }

  setOtaTx(isOtaTx) {
    this.ccTaskData.isOtaTx = isOtaTx;
  }

  setTaskAmount(amount, decimals) {
    this.ccTaskData.amount = amount;
    this.ccTaskData.decimals = Number(decimals);
  }

  setTaskStepNums(stepNums) {
    this.ccTaskData.stepNums = stepNums;
  }
}

module.exports = CrossChainTask;
