'use strict';


module.exports = class ProcessBase {
  constructor(frameworkService) {
    this.m_frameworkService = frameworkService;
    this.m_WebStores = frameworkService.getService("WebStores");
    this.m_taskService = frameworkService.getService("TaskService");
    this.m_iwanBCConnector = frameworkService.getService("iWanConnectorService");
    this.m_storageService = frameworkService.getService("StorageService");
  }
  // virtual function
  async process(paramsJson, wallet) {
  }
  // virtual function
  async getConvertInfoForCheck(paramsJson) {
    let obj = {
      needCheck: false,
      checkInfo: {}
    };
    return obj;
  }

  async sendTransactionData(paramsJson, txData, wallet) {
    try {
      console.log("processBase sendTransactionData paramsJson:", paramsJson);
      let uiStrService = this.m_frameworkService.getService("UIStrService");
      let strFailed = uiStrService.getStrByName("Failed");
      let params = paramsJson.params;

      let accountAry = await wallet.getAccounts();
      if ((!accountAry) || (accountAry.length === 0) || (accountAry[0] !== params.fromAddr)) {
        this.m_WebStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, paramsJson.stepIndex, "", strFailed);
        return;
      }

      let ret = await wallet.sendTransaction(txData);
      if (!ret.result) {
        console.log("ProcessBase sendTransactionData result: %O", ret);
        this.m_WebStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, paramsJson.stepIndex, ret.txhash, ret.desc);
        return;
      } else {
        paramsJson.txhash = ret.txhash;
        let convertCheckInfo = await this.getConvertInfoForCheck(paramsJson);
        let obj = {
          "chain": params.scChainType,
          "ccTaskId": params.ccTaskId,
          "stepIndex": paramsJson.stepIndex,
          "txhash": ret.txhash,
          "convertCheckInfo": convertCheckInfo
        };
        let checkTxReceiptService = this.m_frameworkService.getService("CheckTxReceiptService");
        await checkTxReceiptService.add(obj);
      }
      return;
    }
    catch (err) {
      console.error("ProcessBase sendTransactionData err:", err);
    }
  }

  async checkChainId(paramsJson, wallet) {
    try {
      let uiStrService = this.m_frameworkService.getService("UIStrService");
      let strFailed = uiStrService.getStrByName("Failed");

      let params = paramsJson.params;
      let chainId = await wallet.getChainId();
      if (chainId === params.chainId) {
        return true;
      }
      else {
        this.m_WebStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, paramsJson.stepIndex, "", strFailed);
        return false;
      }      
    } catch (err) {
      console.log("checkChainId err:", err);
      return false;
    }
  }
};
