import tool from "../../utils/tool.js";

const DefaultScanBatchSize = 1000;

const CustomizedScanBatchSize = {
  SGB: 30,
  OKT: 300,
  OKB: 100,
  MATIC: 100,
  SEI: 500,
  FTM: 500
};

class CheckTxReceiptService {
  constructor() {
    this.taskArray = [];
  }

  async init(frameworkService) {
    this.frameworkService = frameworkService;
    this.webStores = frameworkService.getService("WebStores");
    this.iwan = frameworkService.getService("iWanConnectorService");
    this.eventService = frameworkService.getService("EventService");
    this.chainInfoService = frameworkService.getService("ChainInfoService");
    let configService = frameworkService.getService("ConfigService");
    let tonExtension = configService.getExtension("TON");
    if (tonExtension) {
      this.tonTool = tonExtension.tool;
    }
    let taskService = frameworkService.getService("TaskService");
    taskService.addTask(this, 5000);
  }

  async loadTradeTask(taskArray) {
    this.taskArray = taskArray;
  }

  async runTask(taskPara) {
    let connected = await this.iwan.isConnected();
    if (connected === false) {
      //console.log("CheckTxReceiptService runTask iwan no connect");
      return;
    }
    let storageService = this.frameworkService.getService("StorageService");
    let length = this.taskArray.length;
    for (let i = 0; i < length; i++) {
      let index = length - i - 1;
      let task = this.taskArray[index];
      if (task.checkTime) {
        let now = parseInt(Date.now() / 1000);
        if ((now - task.checkTime) >= task.interval) {
          task.checkTime = now;
        } else {
          continue; // wait next schedule and do not need to save
        }
      }
      try {
        if (!this.webStores.crossChainTaskRecords.getTaskById(task.ccTaskId)) {
          console.log("%s CheckTxReceiptService remove deleted task %s", task.chain, task.ccTaskId);
          await storageService.delete("CheckTxReceiptService", task.ccTaskId);
          this.taskArray.splice(index, 1);
          continue;
        }
        let result = await this.checkReceipt(task);
        if ((!result) && task.txCheckInfo) {
          result = await this.checkEvent(task);
        }
        console.debug("%s %s CheckTxReceiptService result: %O", task.chain, task.txHash, result);
        if (result) {
          if (result.txHash && (task.txHash !== result.txHash)) { // update txHash: evm repriced, ton
            console.log("task %s %s update txHash %s to %s", task.ccTaskId, task.chain, task.txHash, result.txHash);
            task.txHash = result.txHash;
            if (task.convertCheckInfo) {
              task.convertCheckInfo.uniqueID = "0x" + tool.hexStrip0x(result.txHash);
              task.convertCheckInfo.txHash = result.txHash; // cctp
            }
          }
          if (result.result === "Succeeded") {
            await this.addToScEventScan(task);
          }
          await this.finishTask(index, task, result.result, result.errInfo);
          continue; // task would be deleted, do not need to save, process next job
        }
      } catch (err) {
        console.error("%s %s CheckTxReceiptService error: %O", task.chain, task.txHash, err);
      }
      await storageService.save("CheckTxReceiptService", task.ccTaskId, task);
    }
  }

  async checkReceipt(task) {
    try {
      let txReceipt;
      if (task.chain === "BTC") {
        txReceipt = await this.iwan.getTxInfo(task.chain, task.txHash, { format: true });
        if (!(txReceipt && txReceipt.blockhash)) {
          txReceipt = null;
        }
      } else if (task.chain === "TON") {
        txReceipt = await this.getTonTxReceipt(task); // get user txHash by msgHash, and cross txHash by user txHash
      } else if (task.chain === "DUST") {
        txReceipt = { status: 1 };
      } else {
        txReceipt = await this.iwan.getTransactionReceipt(task.chain, task.txHash);
      }
      if (txReceipt) {
        let result = "Failed";
        let errInfo = "Transaction failed";
        let isSuccess = false, txHash = ""; // ton need update txHash
        if (["ATOM", "NOBLE", "KAVA"].includes(task.chain)) {
          isSuccess = (txReceipt.code === 0);
        } else if (task.chain === "SOL") {
          isSuccess = (txReceipt.meta.err === null);
        } else if (task.chain === "TRX") {
          isSuccess = txReceipt.ret && txReceipt.ret[0] && (txReceipt.ret[0].contractRet === "SUCCESS");
        } else if (task.chain === "ALGO") {
          isSuccess = (txReceipt['confirmed-round'] > 0);
        } else if (task.chain === "SUI") {
          isSuccess = (txReceipt.effects && txReceipt.effects.status && (txReceipt.effects.status.status === "success"));
        } else if (task.chain === "BTC") {
          isSuccess = true; // in the block means success, ignore confirmations
        } else if (task.chain === "TON") {
          isSuccess = txReceipt.success;
          txHash = txReceipt.txHash;
        } else {
          isSuccess = (txReceipt.status == 1); // 0x0/0x1, true/false
        }
        if (isSuccess) {
          result = "Succeeded";
          errInfo = "";
        }
        return { result, errInfo, txHash };
      } else {
        if (task.chain === "BTC") {
          let delay = parseInt(Date.now() - task.ccTaskId); // ms
          if (delay > 86_400_000) { // 1 day, has been removed from mempool
            return { result: "Failed", errInfo: "Transaction failed" };
          }
        }
        return null;
      }
    } catch (err) { // not finish
      // console.error("%s %s checkReceipt error: %O", task.chain, task.txHash, err);
      return null;
    }
  }

  async checkEvent(task) {
    let txCheckInfo = task.txCheckInfo;
    if (txCheckInfo.nonce === undefined) { // save nonce at first run
      let txInfo = await this.iwan.getTxInfo(task.chain, task.txHash);
      console.debug("task %s %s get txInfo: %O", task.ccTaskId, task.chain, txInfo);
      if (txInfo) {
        txCheckInfo.input = txInfo.input;
        txCheckInfo.nonce = txInfo.nonce;
      } else { // not broadcast yet, or has been replaced before task run
        return null;
      }
    }
    let latestBlock = await this.iwan.getBlockNumber(task.chain);
    let fromBlock = txCheckInfo.fromBlock;
    if (latestBlock >= fromBlock) {
      let scanBatchSize = CustomizedScanBatchSize[task.chain] || DefaultScanBatchSize;
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
      console.debug("task %s %s check tx %s minted: block %d-%d/%d", task.ccTaskId, task.chain, task.txHash, fromBlock, toBlock, latestBlock);
      let chainInfo = this.chainInfoService.getChainInfoByType(task.chain);
      let eventEmitter = tool.cmpAddress(txCheckInfo.to, chainInfo.subsidyCrossSc || "") ? chainInfo.crossScAddr : txCheckInfo.to;
      let events = await this.iwan.getScEvent(task.chain, eventEmitter, txCheckInfo.topics, { fromBlock, toBlock });
      if (events.length) {
        for (let log of events) {
          // console.debug("checkEvent log: %O", log);
          let txInfo = await this.iwan.getTxInfo(task.chain, log.transactionHash);
          if ((txInfo.nonce === txCheckInfo.nonce) && tool.cmpAddress(txInfo.from, txCheckInfo.from)) {
            if (tool.cmpAddress(txInfo.to, txCheckInfo.to) && (txInfo.input === txCheckInfo.input)) {
              return { result: "Succeeded", errInfo: "", txHash: log.transactionHash }; // normal or repriced
            }
          }
        }
      }
      if (txCheckInfo.nonceBlock) {
        if (toBlock > (txCheckInfo.nonceBlock + 10)) {
          console.debug("task %s %s tx %s is replaced or canceled", task.ccTaskId, task.chain, task.txHash);
          return { result: "Failed", errInfo: "Transaction failed" };
        }
      } else {
        let curNonce = await this.iwan.getNonce(task.chain, txCheckInfo.from);
        if (curNonce > txCheckInfo.nonce) {
          txCheckInfo.nonceBlock = latestBlock;
        }
      }
      txCheckInfo.fromBlock = toBlock + 1;
    } else { // rollback
      txCheckInfo.fromBlock = latestBlock;
      txCheckInfo.nonceBlock = 0;
      console.debug("task %s %s check tx %s minted no new block %d/%d", task.ccTaskId, task.chain, task.txHash, fromBlock, latestBlock);
    }
    return null;
  }

  async addToScEventScan(task) {
    if (task.convertCheckInfo) {
      if (!task.convertCheckInfo.fromChain) {
        task.convertCheckInfo.fromChain = task.chain;
      }
      let scEventScanService = this.frameworkService.getService("ScEventScanService");
      await scEventScanService.add(task.convertCheckInfo);
    }
  }

  async add(task) {
    let storageService = this.frameworkService.getService("StorageService");
    if (task.interval) { // check interval in second, some chains such as Bitcoin do not need check frequently
      task.checkTime = parseInt(Date.now() / 1000); // last checktime in second
    }
    await storageService.save("CheckTxReceiptService", task.ccTaskId, task);
    this.taskArray.push(task);
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
      let txs = await this.iwan.call("getTransByMsgHash", { chainType: "TON", msgHash: task.msgHash });
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
        return { success, txHash: crossTxHash || task.userTxHash };
      }
    }
    return null;
  }
}

export default CheckTxReceiptService;
