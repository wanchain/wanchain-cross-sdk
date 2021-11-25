'use strict';

const ProcessBase = require("./processBase.js");

module.exports = class ProcessBurnOtherCoinToAncestorChain extends ProcessBase {
  constructor(frameworkService) {
    super(frameworkService);
  }

  async process(paramsJson, wallet) {
    let uiStrService = this.m_frameworkService.getService("UIStrService");
    let strFailed = uiStrService.getStrByName("Failed");

    let params = paramsJson.params;
    try {
      if (!(await this.checkChainId(paramsJson, wallet))) {
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
      await this.sendTransactionData(paramsJson, txData, wallet);
    } catch (err) {
      console.error("ProcessUserFastBurn error: %O", err);
      this.m_WebStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, paramsJson.stepIndex, "", strFailed, "Failed to send transaction");
    }
  }

  // virtual function
  async getConvertInfoForCheck(paramsJson) {
    let storemanService = this.m_frameworkService.getService("StoremanService");
    let tokenPairObj = await storemanService.getTokenPairObjById(paramsJson.params.tokenPairID);
    let blockNumber;
    if (tokenPairObj.fromChainType === "XRP") {
      blockNumber = await this.m_iwanBCConnector.getLedgerVersion(tokenPairObj.fromChainType);
    } else if (tokenPairObj.fromChainType === "DOT") {
      blockNumber = 0;
      console.log("getConvertInfoForCheck DOT blockNumber");
    } else {
      blockNumber = await this.m_iwanBCConnector.getBlockNumber(tokenPairObj.fromChainType);
    }
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
        "taskType": "BURN",
        "fromChain": tokenPairObj.toChainType,
        "fromAddr": paramsJson.params.fromAddr,
        "chainHash": paramsJson.txhash,
        "toAddr": paramsJson.params.toAddr
      }
    };
    return obj;
  }
};