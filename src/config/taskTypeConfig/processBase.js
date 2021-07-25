'use strict';


module.exports = class ProcessBase {
  constructor(frameworkService) {
    this.m_frameworkService = frameworkService;
    this.m_WebStores = frameworkService.getService("WebStores");
    this.m_taskService = frameworkService.getService("TaskService");
    this.m_iwanBCConnector = frameworkService.getService("iWanConnectorService");
    this.m_storageService = frameworkService.getService("StorageService");

    let ethMaskService = this.m_frameworkService.getService("MetaMaskService");
    this.m_uiStrService = this.m_frameworkService.getService("UIStrService");

    this.m_maskService = {
      "ETH": ethMaskService,
      "BNB": ethMaskService,
      "AVAX": ethMaskService,
      "DEV": ethMaskService,
      "MATIC": ethMaskService,
      "WAN": ethMaskService
    }
  }
  // virtual function
  async process(paramsJson) {
  }
  // virtual function
  async getConvertInfoForCheck(paramsJson) {
    let obj = {
      needCheck: false,
      checkInfo: {}
    };
    return obj;
  }

  async sendTransactionData(paramsJson, txData,) {
    try {
      console.log("processBase sendTransactionData paramsJson:", paramsJson);
      let uiStrService = this.m_frameworkService.getService("UIStrService");
      let strFailed = uiStrService.getStrByName("Failed");

      let params = paramsJson.params;
      let maskService = this.m_maskService[params.scChainType];
      let accountAry = await maskService.getAccountAry();
      if (accountAry.length === 0) {
        this.m_WebStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, paramsJson.stepIndex, "", strFailed);
        return;
      }
      if (accountAry[0] !== params.fromAddr) {
        this.m_WebStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, paramsJson.stepIndex, "", strFailed);
        return;
      }
      let ret = await maskService.sendTransaction(txData);
      if (!ret.result) {
        //console.log("ProcessBase ret:", ret);
        this.m_WebStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, paramsJson.stepIndex, ret.txhash, ret.desc);
        return;
      }
      else {
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
      console.log("ProcessBase sendTransactionData err:", err);
    }
  }

  async checkChainId(paramsJson) {
    try {
      let uiStrService = this.m_frameworkService.getService("UIStrService");
      let strFailed = uiStrService.getStrByName("Failed");

      let params = paramsJson.params;
      let accountService = await this.m_frameworkService.getService("AccountService");
      let chainId = await accountService.getChainId(params.scChainType);
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
