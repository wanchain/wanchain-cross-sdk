'use strict';
let BigNumber = require("bignumber.js");

let ProcessBase = require("./processBase.js");

module.exports = class ProcessWanFnxErc20UserFastMint extends ProcessBase {
  constructor(frameworkService) {
    super(frameworkService);
  }

  async process(paramsJson, wallet) {
    console.log("ProcessWanFnxErc20UserFastMint paramsJson:", paramsJson);
    let uiStrService = this.m_frameworkService.getService("UIStrService");
    let strFailed = uiStrService.getStrByName("Failed");
    let params = paramsJson.params;
    try {
      console.log("ProcessWanFnxErc20UserFastMint 2");
      if (!(await this.checkChainId(paramsJson, wallet))) {
        return;
      }
      console.log("ProcessWanFnxErc20UserFastMint 3");
      if (typeof params.value === "string") {
        params.value = new BigNumber(params.value);
      }
      console.log("ProcessWanFnxErc20UserFastMint 4");
      // check allowance
      let stroemanService = this.m_frameworkService.getService("StoremanService");
      //let tokenPair = await stroemanService.getTokenPairObjById(params.tokenPairID);
      let allowance = await this.m_iwanBCConnector.getErc20Allowance(
        params.scChainType,
        params.wanchainTokenAddr,//tokenPair.wanchainTokenAddr,// tokenAddr
        params.fromAddr,
        params.tokenPairFromAccount,// tokenPair.fromAccount, // pool Addr,
        params.tokenPairErc20Abi);// tokenPair.fromScInfo.erc20AbiJson);
      console.log("ProcessWanFnxErc20UserFastMint 5");
      let bn_allowance = new BigNumber(allowance);
      if (bn_allowance.isLessThan(params.value)) {
        console.log("ProcessWanFnxErc20UserFastMint 6");
        this.m_WebStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, paramsJson.stepIndex, "", strFailed);
        return;
      }
      console.log("ProcessWanFnxErc20UserFastMint 7");

      let txGeneratorService = this.m_frameworkService.getService("TxGeneratorService");

      console.log("params.crossScAddr:", params.crossScAddr);
      console.log("params.storemanGroupId:", params.storemanGroupId);
      console.log("params.tokenPairID:", params.tokenPairID);
      console.log("params.value:", params.value);
      console.log("params.userAccount:", params.userAccount);

      let scData = await txGeneratorService.generateUserBurnData(params.crossScAddr,
        params.crossScAbi,
        params.storemanGroupId,
        params.tokenPairID,
        params.value,
        params.userBurnFee,
        params.tokenAccount,
        params.userAccount);
      console.log("ProcessWanFnxErc20UserFastMint 8");
      // async generateTx(toAddress, value, txData)
      let txValue = params.fee;
      let txData = await txGeneratorService.generateTx(params.scChainType, 0, params.gasLimit, params.crossScAddr, txValue, scData, params.fromAddr);
      await this.sendTransactionData(paramsJson, txData, wallet);
      console.log("ProcessWanFnxErc20UserFastMint 9");
      return;
    }
    catch (err) {
      console.log("ProcessWanFnxErc20UserFastMint process err:", err);
      this.m_WebStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, paramsJson.stepIndex, err.message, strFailed);
    }
  }

  // virtual function
  async getConvertInfoForCheck(paramsJson) {
    let storemanService = this.m_frameworkService.getService("StoremanService");
    let tokenPairObj = await storemanService.getTokenPairObjById(paramsJson.params.tokenPairID);
    let blockNumber = await this.m_iwanBCConnector.getBlockNumber(tokenPairObj.toChainType);
    let obj = {
      needCheck: true,
      checkInfo: {
        "ccTaskId": paramsJson.params.ccTaskId,
        "uniqueID": paramsJson.txhash,
        "userAccount": paramsJson.params.userAccount,
        "smgID": paramsJson.params.storemanGroupId,
        "tokenPairID": paramsJson.params.tokenPairID,
        "value": paramsJson.params.value,
        "chain": tokenPairObj.toChainType,
        "fromBlockNumber": blockNumber,
        "taskType": "MINT"
      }
    };
    return obj;
  }
};


// { "name": "userFastMint", "stepIndex": retAry.length + 1, "title": "userFastMint title", "desc": "userFastMint desc", "params": userFastMintParaJson }
//let userFastMintParaJson = {
//    "fromAddr": convertJson.fromAddr,
//    "scChainType": mintChainInfo.chaintype,
//    "crossScAddr": mintChainScInfo.crossScAddr,
//    "crossScAbi": mintChainScInfo.crossScAbiJson,
//    "storemanGroupId": convertJson.storemanGroupId,
//    "tokenPairID": convertJson.tokenPairId,
//    "value": convertJson.value,
//    "userAccount": convertJson.toAddr,
//    "processHandler": new ProcessUserFastMint(this.m_frameworkService)
//};

