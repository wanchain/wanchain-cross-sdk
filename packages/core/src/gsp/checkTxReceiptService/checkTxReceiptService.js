'use strict';

const tool = require("../../utils/tool.js");

module.exports = class CheckTxReceiptService {
  constructor() {
    this.taskArray = [];
  }

  async init(frameworkService) {
    this.frameworkService = frameworkService;
    this.iwan = frameworkService.getService("iWanConnectorService");
    this.taskService = frameworkService.getService("TaskService");
    this.webStores = frameworkService.getService("WebStores");
    this.eventService = frameworkService.getService("EventService");
    this.chainInfoService = frameworkService.getService("ChainInfoService");
  }

  async loadTradeTask(taskArray) {
    this.taskArray = taskArray;
  }

  async start() {
    this.taskService.addTask(this, 3000);
  }

  async runTask(taskPara) {
    let connected = await this.iwan.isConnected();
    if (connected === false) {
      //console.log("CheckTxReceiptService runTask iwan no connect");
      return;
    }
    let length = this.taskArray.length;
    for (let idx = 0; idx < length; ++idx) {
      let index = length - idx - 1;
      let obj = this.taskArray[index];
      try {
        let result = await this.checkReceipt(obj);
        if ((!result) && obj.txCheckInfo) {
          result = await this.checkEvent(obj);
        }
        console.debug("%s %s CheckTxReceiptService result: %O", obj.chain, obj.txHash, result);
        if (result) {
          if (result.txHash && (obj.txHash !== result.txHash)) { // evm repriced, update txHash
            console.log("task %s %s tx %s is repriced by %s", obj.ccTaskId, obj.chain, obj.txHash, result.txHash);
            obj.txHash = result.txHash;
            if (obj.convertCheckInfo) {
              obj.convertCheckInfo.uniqueID = result.txHash;
            }
          }
          if (result.result === "Succeeded") {
            await this.addToScEventScan(obj);
          }
          await this.finishTask(index, obj, result.result, result.errInfo);
        }
      } catch (err) {
        console.error("%s %s CheckTxReceiptService error: %O", obj.chain, obj.txHash, err);
      }
    }
  }

  async checkReceipt(obj) {
    try {
      let txReceipt = await this.iwan.getTransactionReceipt(obj.chain, obj.txHash);
      if (txReceipt) {
        let result = "Failed";
        let errInfo = "Transaction failed";
        let isSuccess = false;
        if (["ATOM", "NOBLE"].includes(obj.chain)) {
          isSuccess = (txReceipt.code === 0);
        } else if (obj.chain === "SOL") {
          isSuccess = (txReceipt.meta.err === null);
        } else if (obj.chain === "TRX") {
          isSuccess = txReceipt.ret && txReceipt.ret[0] && (txReceipt.ret[0].contractRet === "SUCCESS");
        } else if (obj.chain === "ALGO") {
          isSuccess = (txReceipt['confirmed-round'] > 0);
        } else {
          isSuccess = (txReceipt.status == 1); // 0x0/0x1, true/false
        }
        if (isSuccess) {
          result = "Succeeded";
          errInfo = "";
        }
        return {result, errInfo};
      } else {
        return null;
      }
    } catch (err) { // not finish
      // console.error("%s %s checkReceipt error: %O", obj.chain, obj.txHash, err);
      return null;
    }
  }

  async checkEvent(obj) {
    let storageService = this.frameworkService.getService("StorageService");
    let txCheckInfo = obj.txCheckInfo;
    if (txCheckInfo.nonce === undefined) { // save nonce at first run
      let txInfo = await this.iwan.getTxInfo(obj.chain, obj.txHash);
      console.debug("task %s %s get txInfo: %O", obj.ccTaskId, obj.chain, txInfo);
      if (txInfo) {
        txCheckInfo.input = txInfo.input;
        txCheckInfo.nonce = txInfo.nonce;
        await storageService.save("CheckTxReceiptService", obj.ccTaskId, obj);
      } else { // not broadcast yet, or has been replaced before task run
        return null;
      }
    }
    let latestBlock = await this.iwan.getBlockNumber(obj.chain);
    let fromBlock = txCheckInfo.fromBlock - 30; // for rollback
    if (fromBlock < 1) {
      fromBlock = 1;
    }
    let toBlock = fromBlock;
    if (latestBlock >= fromBlock) {
      let scanBatchSize = (obj.chain === "SGB")? 30 : 300; // OKTC limit 300
      toBlock = fromBlock + scanBatchSize;
      if (toBlock > latestBlock) {
        toBlock = latestBlock;
      }
    } else { // rollback
      txCheckInfo.fromBlock = latestBlock;
      txCheckInfo.nonceBlock = 0;
    }
    console.debug("task %s %s check tx %s minted: block %d-%d/%d", obj.ccTaskId, obj.chain, obj.txHash, fromBlock, toBlock, latestBlock);
    let chainInfo = this.chainInfoService.getChainInfoByType(obj.chain);
    let eventEmitter = tool.cmpAddress(txCheckInfo.to, chainInfo.subsidyCrossSc || "")? chainInfo.crossScAddr : txCheckInfo.to;
    let events = await this.iwan.getScEvent(
      obj.chain,
      eventEmitter,
      txCheckInfo.topics,
      {fromBlock, toBlock}
    );
    if (events.length) {
      for (let log of events) {
        console.debug("checkEvent log: %O", log);
        let txInfo = await this.iwan.getTxInfo(obj.chain, log.transactionHash);
        if ((txInfo.nonce === txCheckInfo.nonce) && tool.cmpAddress(txInfo.from, txCheckInfo.from)) {
          if (tool.cmpAddress(txInfo.to, txCheckInfo.to) && (txInfo.input === txCheckInfo.input)) {
            return {result: "Succeeded", errInfo: "", txHash: log.transactionHash}; // normal or repriced
          }
        }
      }
    }
    if (txCheckInfo.nonceBlock) {
      if (toBlock > (txCheckInfo.nonceBlock + 10)) {
        console.debug("task %s %s tx %s is replaced or canceled", obj.ccTaskId, obj.chain, obj.txHash);
        return {result: "Failed", errInfo: "Transaction failed"};
      }
    } else {
      let curNonce = await this.iwan.getNonce(obj.chain, txCheckInfo.from);
      if (curNonce > txCheckInfo.nonce) {
        txCheckInfo.nonceBlock = latestBlock;
      }
    }
    txCheckInfo.fromBlock = toBlock + 1;
    await storageService.save("CheckTxReceiptService", obj.ccTaskId, obj);
    return null;
  }

  async addToScEventScan(obj) {
    if (obj.convertCheckInfo) {
      let scEventScanService = this.frameworkService.getService("ScEventScanService");
      await scEventScanService.add(obj.convertCheckInfo);
    }
  }

  async add(obj) {
    let storageService = this.frameworkService.getService("StorageService");
    await storageService.save("CheckTxReceiptService", obj.ccTaskId, obj);
    this.taskArray.push(obj);
  }

  async finishTask(taskIndex, task, result, errInfo) {
    await this.eventService.emitEvent(task.event || "TaskStepResult", {
      ccTaskId: task.ccTaskId,
      stepIndex: task.stepIndex,
      txHash: task.txHash,
      result,
      errInfo
    });
    let storageService = this.frameworkService.getService("StorageService");
    await storageService.delete("CheckTxReceiptService", task.ccTaskId);
    this.taskArray.splice(taskIndex, 1);
  }
};