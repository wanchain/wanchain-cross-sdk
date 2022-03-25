'use strict';

const ProcessBase = require("./processBase.js");

module.exports = class ProcessBurnOtherCoinToAncestorChain extends ProcessBase {
  constructor(frameworkService) {
    super(frameworkService);
  }

  async process(stepData, wallet) {
    let uiStrService = this.m_frameworkService.getService("UIStrService");
    let strFailed = uiStrService.getStrByName("Failed");
    let params = stepData.params;
    try {
      if (!(await this.checkChainId(stepData, wallet))) {
        return;
      }
      let txGeneratorService = this.m_frameworkService.getService("TxGeneratorService");
      let scData = await txGeneratorService.generateUserBurnData(params.crossScAddr,
        params.storemanGroupId,
        params.tokenPairID,
        params.value,
        params.userBurnFee,
        params.tokenAccount,
        params.userAccount);

      let txValue = params.fee;
      let txData = await txGeneratorService.generateTx(params.scChainType, params.gasPrice, params.gasLimit, params.crossScAddr.toLowerCase(), txValue, scData, params.fromAddr.toLowerCase());
      await this.sendTransactionData(stepData, txData, wallet);
    } catch (err) {
      console.error("ProcessUserFastBurn error: %O", err);
      this.m_WebStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", strFailed, "Failed to send transaction");
    }
  }

  // virtual function
  async getConvertInfoForCheck(stepData) {
    let params = stepData.params;
    let storemanService = this.m_frameworkService.getService("StoremanService");
    let tokenPair = await storemanService.getTokenPairObjById(params.tokenPairID);
    let blockNumber;
    if (tokenPair.fromChainType === "XRP") {
      blockNumber = await this.m_iwanBCConnector.getLedgerVersion(tokenPair.fromChainType);
    } else if (["DOT", "ADA"].includes(tokenPair.fromChainType)) {
      blockNumber = 0;
      // console.log("getConvertInfoForCheck DOT/ADA blockNumber");
    } else {
      blockNumber = await this.m_iwanBCConnector.getBlockNumber(tokenPair.fromChainType);
    }
    let obj = {
      needCheck: true,
      checkInfo: {
        ccTaskId: params.ccTaskId,
        uniqueID: stepData.txHash,
        userAccount: params.userAccount,
        smgID: params.storemanGroupId,
        tokenPairID: params.tokenPairID,
        value: params.value,
        chain: tokenPair.fromChainType,
        fromBlockNumber: blockNumber,
        taskType: "BURN",
        fromChain: tokenPair.toChainType,
        fromAddr: params.fromAddr,
        chainHash: stepData.txHash,
        toAddr: params.toAddr
      }
    };
    return obj;
  }
};