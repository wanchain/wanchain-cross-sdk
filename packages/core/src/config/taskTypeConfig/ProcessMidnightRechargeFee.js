import tool from "../../utils/tool.js";
'use strict';
export default (class ProcessMidnightRechargeFee {
    constructor(frameworkService) {
        this.frameworkService = frameworkService;
        let configService = frameworkService.getService("ConfigService");
        let extension = configService.getExtension("DUST");
        this.tool = extension.tool;
    }
    async process(stepData, wallet) {
        // console.debug("ProcessMidnightRechargeFee stepData:", stepData);
        let webStores = this.frameworkService.getService("WebStores");
        let params = stepData.params;
        try {
            let sdkWallet = await wallet.getWallet();
            this.tool.api.setWallet(sdkWallet);
            let res = await this.tool.api.userRechargeForFee(params.value);
            let txHash = res.public.txHash;
            webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, txHash, ""); // only update txHash, no result
            let checker = {
                chain: "DUST",
                ccTaskId: params.ccTaskId,
                stepIndex: 0,
                txHash
            };
            console.log("ProcessMidnightRechargeFee checker: %O", checker);
            let checkTxReceiptService = this.frameworkService.getService("CheckTxReceiptService");
            await checkTxReceiptService.add(checker);
        }
        catch (err) {
            console.error("ProcessMidnightRechargeFee error: %O", err);
            if (["User declined to sign the transaction.", "User rejected", "user declined to sign tx"].includes(err.info)) { // code 2 include other errors
                webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Rejected");
            }
            else {
                webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Failed", tool.getErrMsg(err, "Failed to send transaction"));
            }
        }
    }
});
