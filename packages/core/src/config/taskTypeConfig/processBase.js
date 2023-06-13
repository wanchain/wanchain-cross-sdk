'use strict';

const tool = require("../../utils/tool.js");

let WalletRejects = [
  "Error: Returned error: Error: XDCPay Tx Signature: User denied transaction signature.", // XDCPay 1
  "Error: XDCPay Tx Signature: User denied transaction signature.", // XDCPay 2
  "Confirmation declined by user", // TronLink
]

module.exports = class ProcessBase {
  constructor(frameworkService) {
    this.m_frameworkService = frameworkService;
    this.m_WebStores = frameworkService.getService("WebStores");
    this.m_taskService = frameworkService.getService("TaskService");
    this.m_iwanBCConnector = frameworkService.getService("iWanConnectorService");
    this.m_storageService = frameworkService.getService("StorageService");
    this.m_uiStrService = frameworkService.getService("UIStrService");
    this.m_storemanService = frameworkService.getService("StoremanService");
    this.m_tokenPairService = frameworkService.getService("TokenPairService");
    this.m_txGeneratorService = frameworkService.getService("TxGeneratorService");
  }
  // virtual function
  async process(stepData, wallet) {
  }

  // virtual function
  async getConvertInfoForCheck(stepData) {
    return {
      txEventTopics: null,
      convertCheckInfo: null
    };
  }

  async sendTransactionData(stepData, txData, wallet) {
    console.log("processBase sendTransactionData stepData:", stepData);
    let params = stepData.params;
    try {
      let strFailed = this.m_uiStrService.getStrByName("Failed");

      let accountAry = await wallet.getAccounts();
      let curAccount = (accountAry && accountAry.length)? accountAry[0] : "";
      if (curAccount.toLowerCase() !== params.fromAddr.toLowerCase()) {
        this.m_WebStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", strFailed, "Invalid wallet");
        console.error("wallet account changes from %s to %s", params.fromAddr, curAccount);
        return;
      }

      let fromBlock = await this.m_storemanService.getChainBlockNumber(params.scChainType);
      let txHash = await wallet.sendTransaction(txData);
      this.m_WebStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, txHash, ""); // only update txHash, no result
      let {txEventTopics, convertCheckInfo} = await this.getConvertInfoForCheck(stepData);
      let txCheckInfo = null;
      if (params.scChainType !== "TRX") { // do not support tx replacement on tron
        txCheckInfo = {from: txData.from, to: txData.to, topics: txEventTopics, fromBlock, input: "", nonce: undefined, nonceBlock: 0};
        if (wallet.getTxInfo) { // try fetch input and nonce from chain
          let txInfo = await wallet.getTxInfo(txHash);
          if (txInfo) {
            txCheckInfo.input = txInfo.input;
            txCheckInfo.nonce = txInfo.nonce;
          }
        }
      }
      let checker = {
        chain: params.scChainType,
        ccTaskId: params.ccTaskId,
        stepIndex: stepData.stepIndex,
        txHash,
        txCheckInfo,
        convertCheckInfo
      };
      console.log("sendTransactionData checker: %O", checker);
      let checkTxReceiptService = this.m_frameworkService.getService("CheckTxReceiptService");
      await checkTxReceiptService.add(checker);
    } catch (err) {
      if ((err.code === 4001) || WalletRejects.includes(err.toString())) {
        this.m_WebStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Rejected", "");
      } else {
        console.error("ProcessBase sendTransactionData error:", err);
        this.m_WebStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Failed", tool.getErrMsg(err, "Failed to send transaction"));
      }
    }
  }

  async checkChainId(stepData, wallet) {
    let strFailed = this.m_uiStrService.getStrByName("Failed");
    let params = stepData.params;
    try {
      let chainId = await wallet.getChainId();
      if (chainId === params.chainId) {
        return true;
      } else {
        this.m_WebStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", strFailed, "Invalid wallet");
        console.error("wallet chainId changes from %s to %s", params.chainId, chainId);
        return false;
      }      
    } catch (err) {
      this.m_WebStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", strFailed, "Invalid wallet");
      console.error("task %s checkChainId error: %O", params.ccTaskId, err);
      return false;
    }
  }
};
