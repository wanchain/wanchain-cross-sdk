'use strict';

const tool = require("../../utils/tool.js");

let WalletRejects = [
  "Error: Returned error: Error: XDCPay Tx Signature: User denied transaction signature.", // XDCPay 1
  "Error: XDCPay Tx Signature: User denied transaction signature.", // XDCPay 2
  "Confirmation declined by user", // TronLink
]

module.exports = class ProcessCircleBridgeClaim {
    constructor(frameworkService) {
        this.frameworkService = frameworkService;
        this.webStores = frameworkService.getService("WebStores");
    }

    async process(stepData, wallet) {
        let params = stepData.params;
        try {
            if (!(await this.checkChainId(stepData, wallet))) {
                return "Invalid wallet";
            }
            // do not via crossChainTaskSteps to excute claim, update status directly
            let accounts = await wallet.getAccounts();
            if (!(accounts && accounts.length)) {
              this.webStores["crossChainTaskRecords"].modifyTradeTaskStatus(params.ccTaskId, "Claimable", "Invalid wallet");
              console.error("wallet unavailable");
              return "Wallet unavailable";
            }
            let txGeneratorService = this.frameworkService.getService("TxGeneratorService");
            let scData = await txGeneratorService.generateCircleBridgeClaim(params.claimScAddr, params.msg, params.attestation);
            let txData = await txGeneratorService.generateTx(params.scChainType, params.gasPrice, params.gasLimit, params.claimScAddr.toLowerCase(), 0, scData, accounts[0].toLowerCase());
            let txHash = await wallet.sendTransaction(txData);
            let obj = {
              chain: params.scChainType,
              ccTaskId: params.ccTaskId,
              stepIndex: 0,
              txHash,
              type: "claim"
            };
            let checkTxReceiptService = this.frameworkService.getService("CheckTxReceiptService");
            await checkTxReceiptService.add(obj);
            this.webStores["crossChainTaskRecords"].modifyTradeTaskStatus(params.ccTaskId, "Claiming", "");
            return "";
        } catch (err) {
            if ((err.code === 4001) || WalletRejects.includes(err.toString())) {
              this.webStores["crossChainTaskRecords"].modifyTradeTaskStatus(params.ccTaskId, "Claimable", "Rejected");
              return "Rejected";
            } else {
              console.error("ProcessCircleBridgeClaim error: %O", err);
              let errMsg = tool.getErrMsg(err, "Failed to claim");
              this.webStores["crossChainTaskRecords"].modifyTradeTaskStatus(params.ccTaskId, "Claimable", errMsg);
              return errMsg;
            }
        }
    }

    async checkChainId(stepData, wallet) {
      let params = stepData.params;
      try {
        let chainId = await wallet.getChainId();
        if (chainId === params.chainId) {
          return true;
        } else {
          this.webStores["crossChainTaskRecords"].modifyTradeTaskStatus(params.ccTaskId, "Claimable", "Invalid wallet");
          console.error("wallet chainId mismatch: %s != %s", chainId, params.chainId);
          return false;
        }      
      } catch (err) {
        this.webStores["crossChainTaskRecords"].modifyTradeTaskStatus(params.ccTaskId, "Claimable", "Invalid wallet");
        console.error("task %s checkChainId error: %O", params.ccTaskId, err);
        return false;
      }
    }
};