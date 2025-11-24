import tool from "../../utils/tool.js";
'use strict';
export default (class ProcessBurnFromMidnight {
  constructor(frameworkService) {
    this.frameworkService = frameworkService;
    this.storemanService = frameworkService.getService("StoremanService");
    this.configService = frameworkService.getService("ConfigService");
    let extension = this.configService.getExtension("DUST");
    this.tool = extension.tool;
  }
  async process(stepData, wallet) {
    // console.debug("ProcessBurnFromMidnight stepData:", stepData);
    let webStores = this.frameworkService.getService("WebStores");
    let params = stepData.params;
    try {
      let sdkWallet = await wallet.getWallet();
      this.tool.setApiProviders(this.configService.getNetwork(), sdkWallet);
      let res = await this.tool.api.userBurn(params.storemanGroupId, params.userAccount, params.tokenPairID, params.value);
      let txHash = res.public.txHash;
      webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, txHash, ""); // only update txHash, no result
      let checker = {
        chain: "DUST",
        ccTaskId: params.ccTaskId,
        stepIndex: stepData.stepIndex,
        txHash, // only check tx receipt, no event
        convertCheckInfo: {
          ccTaskId: params.ccTaskId,
          txHash,
          uniqueID: txHash,
          chain: params.toChainType,
          fromBlockNumber: await this.storemanService.getChainBlockNumber(params.toChainType),
          taskType: this.tokenPairService.getTokenEventType(params.tokenPairID, direction),
          // for api server
          fromAddr: params.fromAddr,
          toAddr: params.toAddr
        }
      };
      let checkTxReceiptService = this.frameworkService.getService("CheckTxReceiptService");
      await checkTxReceiptService.add(checker);
    }
    catch (err) {
      console.error("ProcessBurnFromMidnight error: %O", err);
      if (["User declined to sign the transaction.", "User rejected", "user declined to sign tx"].includes(err.info)) { // code 2 include other errors
        webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Rejected");
      }
      else {
        webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Failed", tool.getErrMsg(err, "Failed to send transaction"));
      }
    }
  }
});
