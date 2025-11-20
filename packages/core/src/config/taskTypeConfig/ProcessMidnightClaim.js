'use strict';
export default (class ProcessMidnightClaim {
    constructor(frameworkService) {
        this.frameworkService = frameworkService;
        this.webStores = this.frameworkService.getService("WebStores");
        this.configService = frameworkService.getService("ConfigService");
        this.tool = this.configService.getExtension("DUST").tool;
        this.storemanService = frameworkService.getService("StoremanService");
    }
    async process(stepData, wallet) {
        let params = stepData.params;
        let res;
        if (params.isNative) {
            res = await this.tool.api.userClaimCoin(params.uniqueId);
        }
        else {
            res = await this.tool.api.userClaimMappingToken(params.uniqueId);
        }
        let txHash = res.public.txHash;
        let checker = {
            chain: "DUST",
            ccTaskId: params.ccTaskId,
            stepIndex: 0,
            txHash,
            event: "ReclaimTxHash"
        };
        let checkTxReceiptService = this.frameworkService.getService("CheckTxReceiptService");
        await checkTxReceiptService.add(checker);
    }
});
