'use strict';

const tool = require("../../utils/tool.js");

const DefaultScanBatchSize = 1000;
const CustomizedScanBatchSize = {
  SGB: 30,
  OKT: 300,
};

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
    this.configService  = frameworkService.getService("ConfigService");
    let tonExtension = this.configService.getExtension("TON");
    if (tonExtension) {
      this.tonTool = tonExtension.tool;
    }
  }

  async loadTradeTask(taskArray) {
    this.taskArray = taskArray;
  }

  async start() {
    this.taskService.addTask(this, 5000);
  }

  async runTask(taskPara) {
    let connected = await this.iwan.isConnected();
    if (connected === false) {
      //console.log("CheckTxReceiptService runTask iwan no connect");
      return;
    }
    let storageService = this.frameworkService.getService("StorageService");
    let length = this.taskArray.length;
    for (let idx = 0; idx < length; ++idx) {
      let index = length - idx - 1;
      let obj = this.taskArray[index];
      if (obj.checkTime) {
        let now = parseInt(Date.now() / 1000);
        if ((now - obj.checkTime) >= obj.interval) {
          obj.checkTime = now;
        } else {
          continue; // wait next schedule and do not need to save
        }
      }
      try {
        let result = await this.checkReceipt(obj);
        if ((!result) && obj.txCheckInfo) {
          result = await this.checkEvent(obj);
        }
        console.debug("%s %s CheckTxReceiptService result: %O", obj.chain, obj.txHash, result);
        if (result) {
          if (result.txHash && (obj.txHash !== result.txHash)) { // update txHash: evm repriced, ton
            console.log("task %s %s update txHash %s to %s", obj.ccTaskId, obj.chain, obj.txHash, result.txHash);
            obj.txHash = result.txHash;
            if (obj.convertCheckInfo) {
              obj.convertCheckInfo.uniqueID = "0x" + tool.hexStrip0x(result.txHash);
            }
          }
          if (result.result === "Succeeded") {
            await this.addToScEventScan(obj);
          }
          await this.finishTask(index, obj, result.result, result.errInfo);
          continue; // task would be deleted, do not need to save, process next job
        }
      } catch (err) {
        console.error("%s %s CheckTxReceiptService error: %O", obj.chain, obj.txHash, err);
      }
      await storageService.save("CheckTxReceiptService", obj.ccTaskId, obj);
    }
  }

  async checkReceipt(obj) {
    try {
      let txReceipt;
      if (obj.chain === "BTC") {
        txReceipt = await this.iwan.getTxInfo(obj.chain, obj.txHash, {format: true});
        if (!(txReceipt && txReceipt.blockhash)) {
          txReceipt = null;
        }
      } else if (obj.chain === "TON") {
        txReceipt = await this.getTonTxReceipt(obj); // get user txHash by msgHash, and cross txHash by user txHash
      } else {
        txReceipt = await this.iwan.getTransactionReceipt(obj.chain, obj.txHash);
      }
      if (txReceipt) {
        let result = "Failed";
        let errInfo = "Transaction failed";
        let isSuccess = false, txHash = ""; // ton need update txHash
        if (["ATOM", "NOBLE", "KAVA"].includes(obj.chain)) {
          isSuccess = (txReceipt.code === 0);
        } else if (obj.chain === "SOL") {
          isSuccess = (txReceipt.meta.err === null);
        } else if (obj.chain === "TRX") {
          isSuccess = txReceipt.ret && txReceipt.ret[0] && (txReceipt.ret[0].contractRet === "SUCCESS");
        } else if (obj.chain === "ALGO") {
          isSuccess = (txReceipt['confirmed-round'] > 0);
        } else if (obj.chain === "SUI") {
          isSuccess = (txReceipt.effects && txReceipt.effects.status && (txReceipt.effects.status.status === "success"));
        } else if (obj.chain === "BTC") {
          isSuccess = true; // in the block means success, ignore confirmations
        } else if (obj.chain === "TON") {
          isSuccess = txReceipt.success;
          txHash = txReceipt.txHash;
        } else {
          isSuccess = (txReceipt.status == 1); // 0x0/0x1, true/false
        }
        if (isSuccess) {
          result = "Succeeded";
          errInfo = "";
        }
        return {result, errInfo, txHash};
      } else {
        if (obj.chain === "BTC") {
          let delay = parseInt(Date.now() - obj.ccTaskId); // ms
          if (delay > 86_400_000) { // 1 day, has been removed from mempool
            return {result: "Failed", errInfo: "Transaction failed"};
          }
        }
        return null;
      }
    } catch (err) { // not finish
      // console.error("%s %s checkReceipt error: %O", obj.chain, obj.txHash, err);
      return null;
    }
  }

  async checkEvent(obj) {
    let txCheckInfo = obj.txCheckInfo;
    if (txCheckInfo.nonce === undefined) { // save nonce at first run
      let txInfo = await this.iwan.getTxInfo(obj.chain, obj.txHash);
      console.debug("task %s %s get txInfo: %O", obj.ccTaskId, obj.chain, txInfo);
      if (txInfo) {
        txCheckInfo.input = txInfo.input;
        txCheckInfo.nonce = txInfo.nonce;
      } else { // not broadcast yet, or has been replaced before task run
        return null;
      }
    }
    let latestBlock = await this.iwan.getBlockNumber(obj.chain);
    let fromBlock = txCheckInfo.fromBlock;
    if (latestBlock >= fromBlock) {
      let scanBatchSize = CustomizedScanBatchSize[obj.chain] || DefaultScanBatchSize;
      let rewindBlocks = parseInt(scanBatchSize * 0.6);
      let toBlock = fromBlock + scanBatchSize - 1;
      if (toBlock > latestBlock) {
        toBlock = latestBlock;
      }
      // rewind on recent tx
      if ((toBlock + scanBatchSize) > latestBlock) {
        fromBlock = fromBlock - rewindBlocks; // rewind default
        if (fromBlock < 1) {
          fromBlock = 1;
        }
        toBlock = fromBlock + scanBatchSize - 1;
        if (toBlock > latestBlock) { // rewind max
          toBlock = latestBlock;
          fromBlock = toBlock - scanBatchSize + 1;
          if (fromBlock < 1) {
            fromBlock = 1;
          }
        }
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
          // console.debug("checkEvent log: %O", log);
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
    } else { // rollback
      txCheckInfo.fromBlock = latestBlock;
      txCheckInfo.nonceBlock = 0;
      console.debug("task %s %s check tx %s minted no new block %d/%d", obj.ccTaskId, obj.chain, obj.txHash, fromBlock, latestBlock);
    }
    return null;
  }

  async addToScEventScan(obj) {
    if (obj.convertCheckInfo) {
      if (!obj.convertCheckInfo.fromChain) {
        obj.convertCheckInfo.fromChain = obj.chain;
      }
      let scEventScanService = this.frameworkService.getService("ScEventScanService");
      await scEventScanService.add(obj.convertCheckInfo);
    }
  }

  async add(obj) {
    let storageService = this.frameworkService.getService("StorageService");
    if (obj.interval) { // check interval in second, some chains such as Bitcoin do not need check frequently
      obj.checkTime = parseInt(Date.now() / 1000); // last checktime in second
    }
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

  async getTonTxReceipt(task) {
    if (!task.userTxHash) {
      let txs = await this.iwan.call("getTransByMsgHash", {chainType:"TON", msgHash: task.msgHash});
      console.log("getTransByMsgHash %s: %O", task.msgHash, txs);
      if (txs.length) {
        task.userTxHash = txs[0].hash;
      }
    }
    if (task.userTxHash) {
      let receipt = await this.iwan.getTransactionReceipt("TON", task.userTxHash);
      let txHashs = receipt.transactions_order || [];
      if (txHashs.length) {
        let crossTxHash = "", success = false;
        let chainInfo = this.chainInfoService.getChainInfoByType("TON");
        let crossScAddr = this.tonTool.parseAddress(chainInfo.crossScAddr);
        for (let txHash of txHashs) {
          let tx = receipt.transactions[txHash];
          if (crossScAddr.equals(this.tonTool.parseAddress(tx.account))) {
            if (tx.in_msg && (tx.in_msg.opcode === "0x40000001")) {
              crossTxHash = Buffer.from(tx.hash, 'base64').toString('hex').padStart(64, '0'); // use hex format for unique and url
              success = tool.checkTonTxSuccess(tx);
            }
          }
        }
        return {success, txHash: crossTxHash || task.userTxHash};
      }
    }
    return null;
  }
}