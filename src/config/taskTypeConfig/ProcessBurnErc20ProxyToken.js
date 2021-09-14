'use strict';

let BigNumber = require("bignumber.js");
let ProcessBase = require("./processBase.js");

module.exports = class ProcessBurnErc20ProxyToken extends ProcessBase {
  constructor(frameworkService) {
    super(frameworkService);
  }

  async process(paramsJson, wallet) {
    console.log("ProcessBurnErc20ProxyToken paramsJson: %O", paramsJson);
    let uiStrService = this.m_frameworkService.getService("UIStrService");
    let strFailed = uiStrService.getStrByName("Failed");
    let params = paramsJson.params;
    try {
      if (!(await this.checkChainId(paramsJson, wallet))) {
        return;
      }
      if (typeof params.value === "string") {
        params.value = new BigNumber(params.value);
      }
      let stroemanService = this.m_frameworkService.getService("StoremanService");
      let tokenPair = await stroemanService.getTokenPairObjById(params.tokenPairID);
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
      let allowance = await this.m_iwanBCConnector.getErc20Allowance(
        params.scChainType,
        nativeToken,// tokenAddr
        params.fromAddr,
        poolToken,// spender 
        chainInfo.erc20AbiJson);
      let bn_allowance = new BigNumber(allowance);
      if (bn_allowance.isLessThan(params.value)) {
        this.m_WebStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, paramsJson.stepIndex, "", strFailed, "Insufficient ERC20 token allowance");
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
      return;
    }
    catch (err) {
      console.log("ProcessBurnErc20ProxyToken process err: %O", err);
      this.m_WebStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, paramsJson.stepIndex, "", strFailed, "Failed to generate transaction data");
    }
  }

  // virtual function
  async getConvertInfoForCheck(paramsJson) {
    let storemanService = this.m_frameworkService.getService("StoremanService");
    let tokenPair = await storemanService.getTokenPairObjById(paramsJson.params.tokenPairID);
    let chainType = (paramsJson.params.scChainType === tokenPair.fromChainType)? tokenPair.toChainType : tokenPair.fromChainType;
    let blockNumber = await this.m_iwanBCConnector.getBlockNumber(chainType);
    let nativeToken = (paramsJson.params.scChainType === tokenPair.fromChainType)? tokenPair.toNativeToken : tokenPair.fromNativeToken;
    let taskType = nativeToken? "MINT" : "BURN"; // adapt to CheckScEvent task to scan SmgMintLogger or SmgReleaseLogger
    let obj = {
      needCheck: true,
      checkInfo: {
        "ccTaskId": paramsJson.params.ccTaskId,
        "uniqueID": paramsJson.txhash,
        "userAccount": paramsJson.params.userAccount,
        "smgID": paramsJson.params.storemanGroupId,
        "tokenPairID": paramsJson.params.tokenPairID,
        "value": paramsJson.params.value,
        "chain": chainType,
        "fromBlockNumber": blockNumber,
        "taskType": taskType
      }
    };
    return obj;
  }
};
