'use strict';

const ProcessBase = require("./processBase.js");

module.exports = class ProcessBurnErc20ProxyToken extends ProcessBase {
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
      let stroemanService = this.m_frameworkService.getService("StoremanService");
      let tokenPair = stroemanService.getTokenPair(params.tokenPairID);
      let nativeToken, poolToken, chainInfo;
      if (params.scChainType === tokenPair.fromChainType) { // MINT
        nativeToken = tokenPair.fromNativeToken;
        poolToken = tokenPair.fromAccount;
        chainInfo = tokenPair.fromScInfo;
      } else {
        nativeToken = tokenPair.toNativeToken;
        poolToken = tokenPair.toAccount;
        chainInfo = tokenPair.toScInfo;      
      }
      let txGeneratorService = this.m_frameworkService.getService("TxGeneratorService");
      let scData = await txGeneratorService.generateUserBurnData(params.crossScAddr,
        params.storemanGroupId,
        params.tokenPairID,
        params.value,
        params.userBurnFee,
        params.tokenAccount,
        params.userAccount,
        {tokenType: "Erc20"});
      let txValue = params.fee;
      let txData = await txGeneratorService.generateTx(params.scChainType, params.gasPrice, params.gasLimit, params.crossScAddr.toLowerCase(), txValue, scData, params.fromAddr.toLowerCase());
      await this.sendTransactionData(stepData, txData, wallet);
    } catch (err) {
      console.error("ProcessBurnErc20ProxyToken error: %O", err);
      this.m_WebStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", strFailed, "Failed to send transaction");
    }
  }

  // virtual function
  async getConvertInfoForCheck(stepData) {
    let params = stepData.params;
    let storemanService = this.m_frameworkService.getService("StoremanService");
    let tokenPair = storemanService.getTokenPair(params.tokenPairID);
    let chainType = (params.scChainType === tokenPair.fromChainType)? tokenPair.toChainType : tokenPair.fromChainType;
    let blockNumber = await this.m_iwanBCConnector.getBlockNumber(chainType);
    let nativeToken = (params.scChainType === tokenPair.fromChainType)? tokenPair.toNativeToken : tokenPair.fromNativeToken;
    let taskType = nativeToken? "MINT" : "BURN"; // adapt to CheckScEvent task to scan SmgMintLogger or SmgReleaseLogger
    let obj = {
      needCheck: true,
      checkInfo: {
        ccTaskId: params.ccTaskId,
        uniqueID: stepData.txHash,
        userAccount: params.userAccount,
        smgID: params.storemanGroupId,
        tokenPairID: params.tokenPairID,
        value: params.value,
        chain: chainType,
        fromBlockNumber: blockNumber,
        taskType: taskType
      }
    };
    return obj;
  }
};
