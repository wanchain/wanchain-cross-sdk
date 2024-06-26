class CrossChainTask {

  constructor(taskId) {
    this.ccTaskData = {
      ccTaskId: taskId, // the unique id for convert task
      assetPairId: '', // the token pair id of this convert task
      assetType: '', // the token ancestorySymbol
      assetAlias: '', // alias of assetType
      bridge: '', // default WanBridge or Circle bridge
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
      fromDecimals: 0, // from token decimals
      toDecimals: 0, // to token decimals
      sentAmount: '', // actually sent amount
      receivedAmount: '', // final received amount
      status: '',
      stepData: [],
      lockHash: '',
      redeemHash: '',
      uniqueId: '',
      fee: null, 
      isOtaTx: false, // adapted to BTC/XRP crosschain task on 2021.0111 
      ota: null, // adapted to BTC/XRP crosschain task on 2021.0111
      reclaimStatus: '',
      reclaimHash: '',
      errInfo: '',
      // options
      fromAccountId: '',
      toAccountId: '',
    };
  }

  setTaskData(taskData) {
    for (let k in taskData) {
      let sk = (k === 'direction')? 'convertType' : k;
      if (this.ccTaskData[sk] !== undefined) {
        this.ccTaskData[sk] = taskData[k];
      } else {
        console.error("task %s setTaskData undefined key %s", this.ccTaskData.ccTaskId, sk);
      }
    }
  }

  initSteps(stepData = []) {
    stepData.forEach(step => {
      step.txHash = "";
      step.stepResult = "";
      step.errInfo = "";
    });
    this.setTaskData({stepData});
  }
}

module.exports = CrossChainTask;
