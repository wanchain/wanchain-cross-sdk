import BigNumber from "bignumber.js";
import tool from "../../utils/tool.js";
import ProcessBase from "./processBase.js";

class ProcessBurnErc20ProxyToken extends ProcessBase {
  constructor(frameworkService) {
    super(frameworkService);
  }

  async process(stepData, wallet) {
    let params = stepData.params;
    try {
      let txValue = params.fee;
      let scData = await this.txGeneratorService.generateUserBurnData(params.crossScAddr,
        params.storemanGroupId,
        params.tokenPairID,
        params.value,
        params.userBurnFee,
        params.tokenAccount,
        params.userAccount,
        { tokenType: "Erc20", chainType: params.scChainType, from: params.fromAddr, coinValue: txValue });
      let txData = await this.txGeneratorService.generateTx(params.scChainType, scData.gasLimit, params.crossScAddr, txValue, scData.data, params.fromAddr);
      await this.sendTransactionData(stepData, txData, wallet);
    } catch (err) {
      console.error("ProcessBurnErc20ProxyToken error: %O", err);
      this.webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Failed", tool.getErrMsg(err, "Failed to send transaction"));
    }
  }

  async getConvertInfoForCheck(stepData) {
    let params = stepData.params;
    let tokenPair = this.tokenPairService.getTokenPair(params.tokenPairID);
    let direction = (params.scChainType === tokenPair.fromChainType);
    let chainType = direction ? tokenPair.toChainType : tokenPair.fromChainType;
    let blockNumber = await this.storemanService.getChainBlockNumber(chainType);
    let nativeToken = direction ? tokenPair.toNativeToken : tokenPair.fromNativeToken;
    let taskType = nativeToken ? "MINT" : "BURN"; // adapt to CheckScEvent task to scan SmgMintLogger or SmgReleaseLogger
    let srcToken = direction ? tokenPair.fromAccount : tokenPair.toAccount;
    let txEventTopics = [
      "0xe314e23175856b9484e39ab0547753cf1b5cd0cbe3b0d7018c953d31f23fc767", // UserBurnLogger
      params.storemanGroupId, // smgID
      "0x" + new BigNumber(params.tokenPairID).toString(16).padStart(64, '0'), // tokenPairID
      "0x" + tool.hexStrip0x(srcToken).toLowerCase().padStart(64, '0') // tokenAccount
    ];
    let convertCheckInfo = {
      ccTaskId: params.ccTaskId,
      uniqueID: "0x" + tool.hexStrip0x(stepData.txHash),
      userAccount: params.userAccount,
      smgID: params.storemanGroupId,
      tokenPairID: params.tokenPairID,
      value: params.value,
      chain: chainType,
      fromBlockNumber: blockNumber,
      taskType
    };
    return { txEventTopics, convertCheckInfo };
  }
}

export default ProcessBurnErc20ProxyToken;
