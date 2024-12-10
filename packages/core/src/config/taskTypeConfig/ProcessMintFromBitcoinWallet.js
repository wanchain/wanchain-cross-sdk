'use strict';

const tool = require("../../utils/tool.js");

module.exports = class ProcessMintFromBitcoinWallet {
  constructor(frameworkService) {
    this.frameworkService = frameworkService;
    this.webStores = frameworkService.getService("WebStores");
    this.storemanService = frameworkService.getService("StoremanService");
  }

  async process(stepData, wallet) {
    let params = stepData.params;
    try {
      // let txHash = await wallet.sendTransaction(tx.to_hex(), params.fromAddr);
      this.webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, txHash, ""); // only update txHash, no result

      let blockNumber = await this.storemanService.getChainBlockNumber(params.toChainType);
      let direction = (tokenPair.fromChainType === "BTC")? "MINT" : "BURN";
      let checker = {
        chain: "BTC",
        ccTaskId: params.ccTaskId,
        stepIndex: stepData.stepIndex,
        txHash,
        txCheckInfo: null, // only check transaction receipt, no event
        convertCheckInfo: {
          ccTaskId: params.ccTaskId,
          stepIndex: stepData.stepIndex,
          uniqueID: "0x" + tool.hexStrip0x(txHash),
          fromBlockNumber: blockNumber,
          chain: params.toChainType,
          taskType: tokenPairService.getTokenEventType(params.tokenPairID, direction),
          fromChain: "BTC",
          fromAddr: params.fromAddr,
          chainHash: txHash,
          toAddr: params.toAddr
        }
      };
      let checkTxReceiptService = this.frameworkService.getService("CheckTxReceiptService");
      await checkTxReceiptService.add(checker);
    } catch (err) {
      if (err.code === 4001) {
        this.webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Rejected", "");
      } else {
        console.error("ProcessMintFromBitcoinWallet error: %O", ProcessMintFromBitcoinWallet, err);
        this.webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Failed", tool.getErrMsg(err, "Failed to send transaction"));
      }
    }
  }
};