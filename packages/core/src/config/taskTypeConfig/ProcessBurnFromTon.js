'use strict';

const tool = require("../../utils/tool.js");

module.exports = class ProcessBurnFromTon {
  constructor(frameworkService) {
    this.frameworkService = frameworkService;
    this.webStores = this.frameworkService.getService("WebStores");
    this.configService  = frameworkService.getService("ConfigService");
    let extension = this.configService.getExtension("TON");
    this.tool = extension.tool;
    this.storemanService = frameworkService.getService("StoremanService");
    this.tokenPairService = frameworkService.getService("TokenPairService");
    this.iwan = frameworkService.getService("iWanConnectorService");
  }

  async process(stepData, wallet) {
    let params = stepData.params;
    try {
      let tokenPair = this.tokenPairService.getTokenPair(params.tokenPairID);
      let direction = (tokenPair.fromChainType === "TON");
      let fromChainInfo = direction? tokenPair.fromScInfo : tokenPair.toScInfo;
      let toChainInfo = direction? tokenPair.toScInfo : tokenPair.fromScInfo;
      let tokenAccount = direction? tokenPair.fromAccount : tokenPair.toAccount;
      let crossValue = params.value;
      let msgs = this.tool.buildUserTxMsg(); // TODO: params
      let msgHashs = this.tool.getMsgHash(msgs);
      await wallet.sendTransaction(msgs);
      let tx = await this.iwan.getTranByMsgHash(msgHashs);
      let txs = await this.iwan.getTranResultByTxHash(tx.txHash);
      let txHash = txs[0].txHash;
      this.webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, txHash, ""); // only update txHash, no result
      let blockNumber = await this.storemanService.getChainBlockNumber(params.toChainType);
      let checker = {
        chain: "TON",
        ccTaskId: params.ccTaskId,
        stepIndex: stepData.stepIndex,
        txHash,
        txCheckInfo: null, // only check tx receipt, no event
        convertCheckInfo: {
          ccTaskId: params.ccTaskId,
          stepIndex: stepData.stepIndex,
          uniqueID: "0x" + txHash,
          chain: params.toChainType,
          fromBlockNumber: blockNumber,
          taskType: this.tokenPairService.getTokenEventType(params.tokenPairID, (direction? "MINT" : "BURN")),
        }
      };
      let checkTxReceiptService = this.frameworkService.getService("CheckTxReceiptService");
      await checkTxReceiptService.add(checker);
    } catch (err) {
      console.error("error: %s", err.message)
      if (["User rejected the request."].includes(err.message)) {
        this.webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Rejected");
      } else {
        console.error("ProcessBurnFromTon error: %O", err);
        this.webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Failed", tool.getErrMsg(err, "Failed to send transaction"));
      }
    }
  }
};