

import tool from "../../utils/tool.js";

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
    let res, uniqueId = tool.hexStrip0x(params.uniqueId);
    let sdkWallet = await wallet.getWallet();
    this.tool.setApiProviders(this.configService.getNetwork(), sdkWallet);
    if (params.isNative) {
      res = await this.tool.api.userClaimCoin(uniqueId);
    } else {
      res = await this.tool.api.userClaimMappingToken(uniqueId);
    }
    let txHash = res.public.txHash;
    if (res.public.status !== "SucceedEntirely") {
      throw new Error("Failed");
    }
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
