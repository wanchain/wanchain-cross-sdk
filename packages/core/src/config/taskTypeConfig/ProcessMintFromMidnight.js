import BigNumber from "bignumber.js";
import tool from "../../utils/tool.js";

class ProcessMintFromMidnight {
  constructor(frameworkService) {
    this.frameworkService = frameworkService;
    this.storemanService = frameworkService.getService("StoremanService");
    this.tokenPairService = frameworkService.getService("TokenPairService");
    this.configService = frameworkService.getService("ConfigService");
    let extension = this.configService.getExtension("DUST");
    this.tool = extension.tool;
  }

  async process(stepData, wallet) {
    // console.debug("ProcessMintFromMidnight stepData:", stepData);
    let webStores = this.frameworkService.getService("WebStores");
    let params = stepData.params;
    try {
      let sdkWallet = await wallet.connect();
      this.tool.setApiProviders(this.configService.getNetwork(), sdkWallet);
      let tokenPair = this.tokenPairService.getTokenPair(params.tokenPairID);
      let direction = (tokenPair.fromChainType === "DUST");
      let tokenAccount = direction ? tokenPair.fromAccount : tokenPair.toAccount;
      let isCoin = (tokenAccount === "0x0000000000000000000000000000000000000000");
      let crossValue = isCoin ? new BigNumber(params.value).minus(params.networkFee).toFixed(0) : params.value;
      let res = await this.tool.api.userLock(tool.hexStrip0x(params.storemanGroupId), params.userAccount, params.tokenPairID, crossValue);
      console.log("ProcessMintFromMidnight res: %O", res);
      let txHash = res.public.txHash;
      webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, txHash, ""); // only update txHash, no result
      if (res.public.status !== "SucceedEntirely") {
        throw new Error("Failed");
      }
      let checker = {
        chain: "DUST",
        ccTaskId: params.ccTaskId,
        stepIndex: stepData.stepIndex,
        txHash, // only check tx receipt, no event
        convertCheckInfo: {
          ccTaskId: params.ccTaskId,
          txHash,
          uniqueID: '0x' + tool.hexStrip0x(txHash),
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
    } catch (err) {
      console.error("ProcessMintFromMidnight error: %O", err);
      let errMsg = tool.getErrMsg(err, "Failed to send transaction");
      if (errMsg.indexOf("User rejected transaction")) {
        webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Rejected");
      } else {
        webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Failed", errMsg);
      }
    }
  }
}

export default ProcessMintFromMidnight;
