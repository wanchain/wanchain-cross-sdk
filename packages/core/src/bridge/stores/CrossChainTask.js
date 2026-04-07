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
      fromChainName: '', // fromChain name
      toChainName: '', // toChain name
      smg: null, // storemanGroup for this task
      fromAccount: '', // the from account
      toAccount: '', // the to account
      amount: '', // convert amount
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
      errInfo: '',
      wanPoints: '',
    };
  }

  static optionalProperty = Object.freeze({
    ota: null, // adapted to BTC/XRP crosschain task on 2021.0111
    fromAccountId: '', // oneId
    toAccountId: '', // oneId
    extend: null, // dappp custom data, such as external quix tasks
    innerToAccount: '', // cctp to solana
    claimStatus: '',
    claimHash: '',
  });

  setTaskData(taskData) {
    for (let k in taskData) {
      if (k !== 'ccTaskId') {
        let ik = (k === 'direction') ? 'convertType' : k;
        if ((this.ccTaskData[ik] !== undefined) || (this.constructor.optionalProperty[ik] !== undefined)) {
          this.ccTaskData[ik] = taskData[k];
        } else {
          console.error("task %s setTaskData undefined key %s", this.ccTaskData.ccTaskId, ik);
        }
      }
    }
  }

  initSteps(stepData = []) {
    stepData.forEach(step => {
      step.txHash = "";
      step.stepResult = "";
      step.errInfo = "";
    });
    this.setTaskData({ stepData });
  }
}

export default CrossChainTask;
