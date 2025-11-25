import BigNumber from "bignumber.js";
import tool from "../../utils/tool.js";
;
const DefaultGas = 10_000_000;
export default (class ProcessCircleBridgeSuiDeposit {
  constructor(frameworkService) {
    this.frameworkService = frameworkService;
    this.webStores = this.frameworkService.getService("WebStores");
    this.configService = frameworkService.getService("ConfigService");
    let extension = this.configService.getExtension("SUI");
    this.tool = extension.tool;
    this.storemanService = frameworkService.getService("StoremanService");
    this.tokenPairService = frameworkService.getService("TokenPairService");
  }
  async process(stepData, wallet) {
    let params = stepData.params;
    try {
      let tokenPair = this.tokenPairService.getTokenPair(params.tokenPairID);
      let direction = (tokenPair.fromChainType === "SUI");
      let fromChainInfo = direction ? tokenPair.fromScInfo : tokenPair.toScInfo;
      let toChainInfo = direction ? tokenPair.toScInfo : tokenPair.fromScInfo;
      let amount = params.value;
      let tx = this.tool.newTransaction();
      // fee
      let suiCoins = await this.storemanService.getSuiCoins(params.fromAddr, "0x2::sui::SUI");
      let totalSui = new BigNumber(params.networkFee).plus(DefaultGas).toFixed();
      let selectedSuiCoins = this.tool.selectCoins(suiCoins, totalSui);
      tx.setGasPayment(selectedSuiCoins.map(v => {
        return { objectId: v.coinObjectId, version: v.version, digest: v.digest };
      }));
      let [feeCoin] = tx.splitCoins(tx.gas, [params.networkFee]);
      // usdc asset
      let usdcAccount = tool.ascii2letter(direction ? tokenPair.fromAccount : tokenPair.toAccount);
      let usdcCoins = await this.storemanService.getSuiCoins(params.fromAddr, usdcAccount);
      let selectedUsdcCoins = this.tool.selectCoins(usdcCoins, amount);
      let assetCoin = selectedUsdcCoins[0];
      if (selectedUsdcCoins.length > 1) {
        tx.mergeCoins(assetCoin.coinObjectId, selectedUsdcCoins.slice(1).map(v => v.coinObjectId));
      }
      let [usdcCoin] = tx.splitCoins(assetCoin.coinObjectId, [amount]);
      //
      tx.moveCall({
        target: fromChainInfo.CircleBridge.crossScAddr + '::fee_collector::collect_fee',
        arguments: [
          tx.object(fromChainInfo.CircleBridge.feeConfig),
          tx.object(fromChainInfo.CircleBridge.feeCollectorConfig),
          tx.pure.u64(toChainInfo.chainId),
          feeCoin,
        ],
      });
      tx.transferObjects([feeCoin], params.fromAddr);
      tx.moveCall({
        target: fromChainInfo.CircleBridge.tokenMessengerMinter + '::deposit_for_burn::deposit_for_burn',
        arguments: [
          usdcCoin,
          tx.pure.u32(toChainInfo.CircleBridge.domain),
          tx.pure.address(params.userAccount),
          tx.object(fromChainInfo.CircleBridge.tokenMessengerMinterState),
          tx.object(fromChainInfo.CircleBridge.messageTransmitterState),
          tx.object(fromChainInfo.CircleBridge.denyList),
          tx.object(fromChainInfo.CircleBridge.treasury)
        ],
        typeArguments: [usdcAccount],
      });
      if (toChainInfo.chainType === "SOL") { // register wallet address before sending tx and it must be successful, otherwise agent may not process it
        await this.storemanService.registerSolWalletAddress(params.innerToAddr, params.toAddr);
      }
      let txHash = await wallet.sendTransaction(tx, params.fromAddr);
      if (params.innerToAddr && (params.innerToAddr !== params.toAddr)) {
        this.webStores["crossChainTaskRecords"].setExtraInfo(params.ccTaskId, { innerToAccount: params.innerToAddr });
      }
      this.webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, txHash, ""); // only update txHash, no result
      let blockNumber = await this.storemanService.getChainBlockNumber(params.toChainType, { bridge: "Circle" });
      let checker = {
        chain: "SUI",
        ccTaskId: params.ccTaskId,
        stepIndex: stepData.stepIndex,
        txHash,
        txCheckInfo: null, // only check tx receipt, no event
        convertCheckInfo: {
          ccTaskId: params.ccTaskId,
          txHash,
          uniqueID: tool.sha256(txHash),
          chain: params.toChainType,
          fromBlockNumber: blockNumber,
          taskType: "circleMINT",
          fromChain: fromChainInfo.chainType,
          depositDomain: fromChainInfo.CircleBridge.domain,
          depositNonce: undefined, // deposit nonce is really uniqueID
          depositAmount: 0,
        }
      };
      let checkTxReceiptService = this.frameworkService.getService("CheckTxReceiptService");
      await checkTxReceiptService.add(checker);
    }
    catch (err) {
      if (["Rejected from user"].includes(err.message)) {
        this.webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Rejected");
      }
      else {
        console.error("ProcessCircleBridgeSuiDeposit error: %O", err);
        this.webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Failed", tool.getErrMsg(err, "Failed to send transaction"));
      }
    }
  }
  async getComputeUnitPrice(wallet) {
    try {
      let recentFees = await wallet.getRecentPrioritizationFees();
      let sum = 0, cnt = 0, fee;
      recentFees.forEach(v => {
        fee = v.prioritizationFee;
        if (fee > 0) {
          sum = sum + fee;
          cnt++;
        }
      });
      let average = cnt ? Math.ceil(sum / cnt) : 0;
      return average;
    }
    catch (err) {
      console.error("getRecentPrioritizationFees error: %O", err);
      return 0;
    }
  }
});
