import BigNumber from "bignumber.js";
import util from "util";
import axios from "axios";
import tool from "../../utils/tool.js";

class CheckTonTx {
  constructor(frameworkService) {
    this.frameworkService = frameworkService;
    this.eventTasks = new Map();
  }

  async init(chainInfo) {
    this.chainInfo = chainInfo;
    this.webStores = this.frameworkService.getService("WebStores");
    this.taskService = this.frameworkService.getService("TaskService");
    this.taskService.addTask(this, chainInfo.txScanInterval);
    this.eventService = this.frameworkService.getService("EventService");
    this.eventTypes = ["BURN"]; // no other type yet
    this.eventTypes.forEach(v => this.eventTasks.set(v, []));
    let configService = this.frameworkService.getService("ConfigService");
    this.tonTool = configService.getExtension("TON").tool;
  }

  async add(task) {
    let tasks = this.eventTasks.get(task.taskType);
    if (tasks) {
      tasks.unshift(task);
    } else {
      console.error("CheckTonTx do not support %s task: %O", task.taskType, task);
    }
  }

  async load(task) {
    await this.add(task);
  }

  async runTask(taskPara) {
    try {
      for (let v of this.eventTypes) {
        await this.processScLogger(v);
      }
    } catch (err) {
      console.error("CheckTonTx error: %O", err);
    }
  }

  async processScLogger(taskType) {
    let tasks = this.eventTasks.get(taskType);
    let count = tasks.length;
    if (count === 0) {
      return;
    }
    let storageService = this.frameworkService.getService("StorageService");
    for (let i = 0; i < count; i++) {
      let cur = count - i - 1; // backwards
      let task = tasks[cur];
      try {
        if (!this.webStores.crossChainTaskRecords.getTaskById(task.ccTaskId)) {
          console.log("CheckTonTx remove deleted task %s", task.ccTaskId);
          await storageService.delete("ScEventScanService", task.uniqueID);
          tasks.splice(cur, 1);
          continue;
        }
        console.debug("CheckTonTx %s: taskId=%s, uniqueId=%s, startTime=%d", taskType, task.ccTaskId, task.uniqueID, task.fromBlockNumber);
        let event = await this.scanWanBridgeEvent(task);
        if (event) {
          await this.updateUIAndStorage(task, event.txHash, event.toAccount, event.value);
          tasks.splice(cur, 1);
          continue; // skip save task and process next job
        }
      } catch (err) {
        console.error("CheckTonTx %s task %O error: %O", taskType, task, err);
      }
      await storageService.save("ScEventScanService", task.uniqueID, task); // always save regardless of exception
    }
  }

  async scanWanBridgeEvent(task) {
    let now = parseInt(Date.now() / 1000);
    // default scan range
    let startTime = task.fromBlockNumber;
    let endTime = startTime + 3600; // seconds
    if (endTime > now) {
      endTime = now;
    }
    // rewind on recent tx
    if ((endTime + 3600) > now) {
      startTime = startTime - 300;
      endTime = startTime + 3600;
      if (endTime > now) {
        endTime = now;
      }
    }
    let wbTxs = [], limit = 100;
    for (let offset = 0; true; offset += limit) {
      let batchTxs = await this.getTransactions(this.chainInfo.crossScAddr, { startTime, endTime, limit, offset });
      if (batchTxs.length) {
        wbTxs = wbTxs.concat(batchTxs);
      }
      if (batchTxs.length < limit) {
        break;
      }
    }
    for (let tx of wbTxs) {
      if (tool.checkTonTxSuccess(tx)) {
        if (tx.in_msg && (tx.in_msg.opcode === "0x40000005") && tx.in_msg.message_content) { // smg release
          let cell = this.tonTool.msg2Cell(tx.in_msg.message_content.body);
          let slice = cell.beginParse();
          slice.skip(32 + 64); // opCode + queryId
          let uniqueId = '0x' + new BigNumber(slice.loadUintBig(256)).toString(16).padStart(64, '0');
          if (uniqueId === task.uniqueID) {
            slice.skip(256 + 32); // smg + tokenPair
            let value = new BigNumber(slice.loadUintBig(256)).toFixed();
            let slice2 = slice.loadRef().beginParse();
            slice2.skip(256); // operateFee
            let toAccount = slice2.loadAddress().toString();
            // slice2.endParse();
            // slice.endParse();
            let txHash = Buffer.from(tx.hash, 'base64').toString('hex').padStart(64, '0'); // use hex format
            console.debug("scanWanBridgeEvent task %d tx %s get smgEvent: %O", task.ccTaskId, txHash, tx);
            return { txHash, toAccount, value };
          } else {
            console.log("tx %s slice: %O", tx.hash, slice);
            // slice.endParse();
          }
        }
      }
    }
    task.fromBlockNumber = endTime;
    return null;
  }

  async updateUIAndStorage(task, txHash, toAccount, value) {
    this.eventService.emitEvent("RedeemTxHash", { ccTaskId: task.ccTaskId, txHash, toAccount: toAccount || "", value: value || task.value });
    let storageService = this.frameworkService.getService("StorageService");
    await storageService.delete("ScEventScanService", task.uniqueID);
  }

  async getTransactions(account, options) {
    let url = util.format("%s/api/v3/transactions?account=%s&start_utime=%d&end_utime=%d&limit=%d&offset=%d&sort=asc",
      this.chainInfo.rpc, account, options.startTime, options.endTime, options.limit || 10, options.offset || 0);
    let res = await tool.timedPromise(axios.get(url));
    return res.data.transactions;
  }
}

export default CheckTonTx;
