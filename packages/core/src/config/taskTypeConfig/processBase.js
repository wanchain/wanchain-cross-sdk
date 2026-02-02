import tool from "../../utils/tool.js";

const WalletRejects = [
  "Error: Returned error: Error: XDCPay Tx Signature: User denied transaction signature.", // XDCPay 1
  "Error: XDCPay Tx Signature: User denied transaction signature.", // XDCPay 2
  "Confirmation declined by user", // TronLink
];

class ProcessBase {
  constructor(frameworkService) {
    this.frameworkService = frameworkService;
    this.webStores = frameworkService.getService("WebStores");
    this.iwan = frameworkService.getService("iWanConnectorService");
    this.storemanService = frameworkService.getService("StoremanService");
    this.tokenPairService = frameworkService.getService("TokenPairService");
    this.txGeneratorService = frameworkService.getService("TxGeneratorService");
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
      let checkWalletId = this.storemanService.checkWalletId(params.scChainType, wallet);
      if (!checkWalletId) {
        this.webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Failed", "Invalid wallet");
        console.error("task %s wallet chainId changed", params.ccTaskId);
        return;
      }
      if (params.scChainType !== "VET") { // VeWorld wallet support auto switch address so do not need to check
        let accountAry = await wallet.getAccounts();
        let curAccount = (accountAry && accountAry.length) ? accountAry[0] : "";
        if (curAccount.toLowerCase() !== params.fromAddr.toLowerCase()) {
          this.webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Failed", "Invalid wallet account");
          console.error("wallet account changes from %s to %s", params.fromAddr, curAccount);
          return;
        }
      }
      let fromBlock = await this.storemanService.getChainBlockNumber(params.scChainType);
      let txHash = await wallet.sendTransaction(txData, params.fromAddr);
      if (params.innerToAddr && (params.innerToAddr !== params.toAddr)) {
        this.webStores["crossChainTaskRecords"].setExtraInfo(params.ccTaskId, { innerToAccount: params.innerToAddr });
      }
      this.webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, txHash, ""); // only update txHash, no result
      let { txEventTopics, convertCheckInfo } = await this.getConvertInfoForCheck(stepData);
      let txCheckInfo = null;
      if (!["TRX", "VET"].includes(params.scChainType)) { // do not consider tx replacement on some evm compatible chains
        txCheckInfo = { from: txData.from, to: txData.to, topics: txEventTopics, fromBlock, input: "", nonce: undefined, nonceBlock: 0 };
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
      let checkTxReceiptService = this.frameworkService.getService("CheckTxReceiptService");
      await checkTxReceiptService.add(checker);
    } catch (err) {
      if ((err.code === 4001) || WalletRejects.includes(err.toString())) {
        this.webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Rejected", "");
      } else {
        console.error("ProcessBase sendTransactionData error:", err);
        this.webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Failed", tool.getErrMsg(err, "Failed to send transaction"));
      }
    }
  }
}

export default ProcessBase;
