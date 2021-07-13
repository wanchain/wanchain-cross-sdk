'use strict';

let BigNumber = require("bignumber.js");
let ProcessBase = require("./processBase.js");

module.exports = class ProcessFnxErc20UserFastBurn extends ProcessBase {
  constructor(frameworkService) {
    super(frameworkService);
  }

  async process(paramsJson) {
    //console.log("ProcessFnxErc20UserFastBurn paramsJson:", paramsJson);
    let uiStrService = this.m_frameworkService.getService("UIStrService");
    let strFailed = uiStrService.getStrByName("Failed");

    let params = paramsJson.params;
    //console.log("ProcessFnxErc20UserFastBurn params:", params);
    try {
      if (!(await this.checkChainId(paramsJson))) {
        return;
      }
      if (typeof params.value === "string") {
        params.value = new BigNumber(params.value);
      }
      let stroemanService = this.m_frameworkService.getService("StoremanService");
      let tokenPair = await stroemanService.getTokenPairObjById(params.tokenPairID);
      let allowance = await this.m_iwanBCConnector.getErc20Allowance(
        params.scChainType,
        tokenPair.wanchainTokenAddr,// tokenAddr
        params.fromAddr,
        tokenPair.toAccount,// spender 
        tokenPair.toScInfo.erc20AbiJson);
      let bn_allowance = new BigNumber(allowance);
      if (bn_allowance.isLessThan(params.value)) {
        this.m_WebStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, paramsJson.stepIndex, "", strFailed);
        return;
      }
      let txGeneratorService = this.m_frameworkService.getService("TxGeneratorService");
      let scData = await txGeneratorService.generateUserBurnData(params.crossScAddr,
        params.crossScAbi,
        params.storemanGroupId,
        params.tokenPairID,
        params.value,
        params.userBurnFee,
        params.tokenAccount,
        params.userAccount);

      let txValue = params.fee;
      let txData = await txGeneratorService.generateTx(params.scChainType, params.gasPrice, params.gasLimit, params.crossScAddr.toLowerCase(), txValue, scData, params.fromAddr.toLowerCase());
      await this.sendTransactionData(paramsJson, txData, params.fromAddr);
      return;
    }
    catch (err) {
      console.log("ProcessFnxErc20UserFastBurn process err:", err);
      this.m_WebStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, paramsJson.stepIndex, err.message, strFailed);
    }
  }

  // virtual function
  async getConvertInfoForCheck(paramsJson) {
    let storemanService = this.m_frameworkService.getService("StoremanService");
    let tokenPairObj = await storemanService.getTokenPairObjById(paramsJson.params.tokenPairID);
    let blockNumber = await this.m_iwanBCConnector.getBlockNumber(tokenPairObj.fromChainType);
    let obj = {
      needCheck: true,
      checkInfo: {
        "ccTaskId": paramsJson.params.ccTaskId,
        "uniqueID": paramsJson.txhash,
        "userAccount": paramsJson.params.userAccount,
        "smgID": paramsJson.params.storemanGroupId,
        "tokenPairID": paramsJson.params.tokenPairID,
        "value": paramsJson.params.value,
        "chain": tokenPairObj.fromChainType,
        "fromBlockNumber": blockNumber,
        "taskType": "BURN"
      }
    };
    return obj;
  }
};
