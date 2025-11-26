import tool from "../../utils/tool.js";
import ProcessBase from "./processBase.js";

class ProcessCircleBridgeDeposit extends ProcessBase {
  constructor(frameworkService) {
    super(frameworkService);
    this.storemanService = frameworkService.getService("StoremanService");
  }

  async process(stepData, wallet) {
    let params = stepData.params;
    try {
      if (!(await this.checkChainId(stepData, wallet))) {
        return;
      }
      let tokenPair = this.m_tokenPairService.getTokenPair(params.tokenPairID);
      let toChainInfo = (params.scChainType === tokenPair.fromChainType) ? tokenPair.toScInfo : tokenPair.fromScInfo;
      let options = { chainType: params.scChainType, from: params.fromAddr, coinValue: params.networkFee, isV2: params.isV2, operateFee: params.operateFee };
      let scData = await this.m_txGeneratorService.generateCircleBridgeDeposit(params.crossScAddr, toChainInfo.CircleBridge.domain, params.value, params.tokenAccount, params.userAccount, options);
      let txData = await this.m_txGeneratorService.generateTx(params.scChainType, scData.gasLimit, params.crossScAddr, params.networkFee, scData.data, params.fromAddr);
      if (toChainInfo.chainType === "SOL") { // register wallet address before sending tx and it must be successful, otherwise agent may not process it
        await this.storemanService.registerSolWalletAddress(params.innerToAddr, params.toAddr);
      }
      await this.sendTransactionData(stepData, txData, wallet);
    } catch (err) {
      console.error("ProcessCircleBridgeDeposit error: %O", err);
      this.m_WebStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Failed", tool.getErrMsg(err, "Failed to send transaction"));
    }
  }

  async getConvertInfoForCheck(stepData) {
    let params = stepData.params;
    let tokenPair = this.m_tokenPairService.getTokenPair(params.tokenPairID);
    let direction = (params.scChainType === tokenPair.fromChainType);
    let depositChain = direction ? tokenPair.fromChainType : tokenPair.toChainType;
    let depositChainInfo = direction ? tokenPair.fromScInfo : tokenPair.toScInfo;
    let checkChain = direction ? tokenPair.toChainType : tokenPair.fromChainType;
    let storemanService = this.m_frameworkService.getService("StoremanService");
    let blockNumber = await storemanService.getChainBlockNumber(checkChain, { bridge: "Circle" });
    let txEventTopics = [
      params.isV2 ? "0x66a078553dce4e0d1dd6b47fd4499fdaa88bd907d075716da8782f4e7da50e71" : "0x6dce5b2406630dbc3a2633f31a15505733a9ede5169532aaab88ac01c77ff1e4", // DepositForBurnWithFee
    ];
    let convertCheckInfo = {
      ccTaskId: params.ccTaskId,
      txHash: stepData.txHash,
      uniqueID: "0x" + tool.hexStrip0x(stepData.txHash),
      chain: checkChain,
      fromBlockNumber: blockNumber,
      taskType: params.isV2 ? "cctpV2MINT" : "circleMINT",
      fromChain: depositChain,
      depositDomain: depositChainInfo.CircleBridge.domain,
      depositNonce: undefined, // deposit nonce is really uniqueID
      depositAmount: 0
    };
    return { txEventTopics, convertCheckInfo };
  }
}

export default ProcessCircleBridgeDeposit;
