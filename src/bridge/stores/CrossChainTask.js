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
      fromDecimals: 0, // from token decimals
      toDecimals: 0, // to token decimals
      sentAmount: '', // actually sent amount
      receivedAmount: '', // final received amount
      status: '',
      stepData: [],
      lockHash: '',
      redeemHash: '',
      uniqueId: '',
      stepNums: 0, // convert steps num
      fromAccountBalance: '',
      fee: null, 
      isOtaTx: false, // adapted to BTC/XRP crosschain task on 2021.0111 
      ota: null, // adapted to BTC/XRP crosschain task on 2021.0111
      errInfo: ''
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
}

module.exports = CrossChainTask;
