import tool from "../../utils/tool.js";

class CheckSuiTx {
  constructor(frameworkService) {
    this.frameworkService = frameworkService;
    this.eventTasks = new Map();
  }

  async init(chainInfo) {
    this.chainInfo = chainInfo;
    this.scanBatchSize = 500;
    this.webStores = this.frameworkService.getService("WebStores");
    this.iwan = this.frameworkService.getService("iWanConnectorService");
    this.taskService = this.frameworkService.getService("TaskService");
    this.taskService.addTask(this, chainInfo.txScanInterval);
    this.eventService = this.frameworkService.getService("EventService");
    this.storemanService = this.frameworkService.getService("StoremanService");
    this.eventTypes = ["MINT", "BURN", "circleMINT"];
    this.eventTypes.forEach(v => this.eventTasks.set(v, []));
    let crossEventId = chainInfo.crossEventId || chainInfo.crossScAddr;
    this.SmgMintMsg = crossEventId + "::cross::SmgMintLogger";
    this.SmgReleaseMsg = crossEventId + "::cross::SmgReleaseLogger";
    this.cctpReceiveMsg = chainInfo.CircleBridge.messageTransmitter + "::receive_message::MessageReceived";
  }

  async add(task) {
    let tasks = this.eventTasks.get(task.taskType);
    if (tasks) {
      tasks.unshift(task);
    }
  }

  async load(task) {
    await this.add(task);
  }

  async runTask(taskPara) {
    try {
      let connected = await this.iwan.isConnected();
      if (connected) {
        for (let v of this.eventTypes) {
          await this.processScLogger(v);
        }
      }
    } catch (err) {
      console.error("CheckSuiTx error: %O", err);
    }
  }

  async processScLogger(taskType) {
    let tasks = this.eventTasks.get(taskType);
    let count = tasks.length;
    if (count === 0) {
      return;
    }
    let latestBlockNumber = await this.iwan.getBlockNumber("SUI");
    if (latestBlockNumber === 0) { // failed
      console.error("CheckSuiTx %s get latest block number error", taskType);
      return;
    }
    let storageService = this.frameworkService.getService("StorageService");
    for (let i = 0; i < count; i++) {
      let cur = count - i - 1; // backwards
      let task = tasks[cur];
      try {
        if (!this.webStores.crossChainTaskRecords.getTaskById(task.ccTaskId)) {
          console.log("CheckSuiTx remove deleted task %s", task.ccTaskId);
          await storageService.delete("ScEventScanService", task.uniqueID);
          tasks.splice(cur, 1);
          continue;
        }
        if (task.fromBlockNumber == 0) { // retry get block number firstly
          let delay = parseInt((Date.now() - task.ccTaskId) / 1000) * 10;
          let blockNumber = latestBlockNumber - delay;
          console.log("CheckSuiTx task %d %s retry blockNumber %d(+%d)", task.ccTaskId, taskType, blockNumber, delay);
          if (blockNumber < 0) {
            blockNumber = 1;
          }
          task.fromBlockNumber = blockNumber;
        }
        let fromBlockNumber = task.fromBlockNumber;
        if (latestBlockNumber >= fromBlockNumber) {
          let toBlockNumber = fromBlockNumber + this.scanBatchSize - 1;
          if (toBlockNumber > latestBlockNumber) {
            toBlockNumber = latestBlockNumber;
          }
          // rewind on recent tx
          if ((toBlockNumber + this.scanBatchSize) > latestBlockNumber) {
            fromBlockNumber = fromBlockNumber - 100; // rewind default
            if (fromBlockNumber < 1) {
              fromBlockNumber = 1;
            }
            toBlockNumber = fromBlockNumber + this.scanBatchSize - 1;
            if (toBlockNumber > latestBlockNumber) { // rewind max
              toBlockNumber = latestBlockNumber;
              fromBlockNumber = toBlockNumber - this.scanBatchSize + 1;
              if (fromBlockNumber < 1) {
                fromBlockNumber = 1;
              }
            }
          }
          let event = null;
          console.debug("CheckSuiTx block %d-%d/%d %s: taskId=%s, uniqueId=%s", fromBlockNumber, toBlockNumber, latestBlockNumber, taskType, task.ccTaskId, task.uniqueID);
          if (task.taskType === "circleMINT") {
            event = await this.scanCircleEvent(task, fromBlockNumber, toBlockNumber);
          } else {
            event = await this.scanWanBridgeEvent(task, fromBlockNumber, toBlockNumber);
          }
          if (event) {
            await this.updateUIAndStorage(task, event.txHash, event.toAccount, event.value);
            tasks.splice(cur, 1);
            continue; // skip save task and process next job
          }
        } else { // rollback
          task.fromBlockNumber = latestBlockNumber;
          console.debug("CheckSuiTx no new block %d/%d %s: taskId=%s, uniqueId=%s", fromBlockNumber, latestBlockNumber, taskType, task.ccTaskId, task.uniqueID);
        }
      } catch (err) {
        console.error("CheckSuiTx block %d %s task %O error: %O", latestBlockNumber, taskType, task, err);
      }
      await storageService.save("ScEventScanService", task.uniqueID, task); // always save regardless of exception
    }
  }

  async scanWanBridgeEvent(task, fromBlock, toBlock) {
    let cursor = "";
    for ( ; ; ) {
      let result = await this.iwan.getScEvent("SUI", this.chainInfo.crossScAddr, [], { moduleName: "cross", order: "ascending", fromBlock, toBlock, cursor });
      let ccTxs = result.data;
      for (let tx of ccTxs) {
        let txHash = tx.id.txDigest;
        let receipt = await this.iwan.getTransactionReceipt("SUI", txHash);
        let msgType = (task.taskType === "MINT") ? this.SmgMintMsg : this.SmgReleaseMsg;
        let smgEvent = receipt.events.find(v => ((v.transactionModule === "cross") && (v.type === msgType)));
        if (smgEvent) {
          let event = tool.parseProtobufStruct(smgEvent.parsedJson);
          if (event) {
            let uniqueId = '0x' + Buffer.from(event.unique_id, 'base64').toString('hex');
            if (uniqueId === task.uniqueID) {
              console.debug("scanWanBridgeEvent task %d tx %s get smgEvent: %O", task.ccTaskId, txHash, event);
              return { txHash, toAccount: event.recipient, value: event.amount };
            }
          }
        }
      }
      if (result.hasNextPage && result.nextCursor) {
        cursor = result.nextCursor;
      } else {
        break;
      }
    }
    task.fromBlockNumber = toBlock + 1;
    return null;
  }

  async scanCircleEvent(task, fromBlock, toBlock) {
    if (task.depositNonce === undefined) {
      let deposit = await this.storemanService.parseCctpDeposit(task.fromChain, task.txHash, { ota: task.ota });
      if (deposit.depositNonce !== undefined) {
        task.depositNonce = deposit.depositNonce;
        task.depositAmount = deposit.depositAmount;
      } else {
        console.error("scanCircleEvent task %d failed to parseCctpDeposit for chain %s tx %s", task.ccTaskId, task.fromChain, task.txHash);
        return null;
      }
    }
    let cursor = "";
    for ( ; ; ) {
      let result = await this.iwan.getScEvent("SUI", this.chainInfo.CircleBridge.crossScAddr, [], { moduleName: "fee_collector", order: "ascending", fromBlock, toBlock, cursor });
      let ccTxs = result.data;
      for (let tx of ccTxs) {
        let txHash = tx.id.txDigest;
        let receipt = await this.iwan.getTransactionReceipt("SUI", txHash);
        let receiveEvent = receipt.events.find(v => ((v.transactionModule === "receive_message") && (v.type === this.cctpReceiveMsg)));
        if (receiveEvent) {
          let event = tool.parseProtobufStruct(receiveEvent.parsedJson);
          if (event) {
            let sourceDomain = event.source_domain; // number
            let nonce = event.nonce; // string
            if ((sourceDomain == task.depositDomain) && (nonce == task.depositNonce)) {
              console.debug("scanCircleEvent task %d tx %s get receiveEvent: %O", task.ccTaskId, txHash, event);
              return { txHash }; // no value or toAccount
            }
          }
        }
      }
      if (result.hasNextPage && result.nextCursor) {
        cursor = result.nextCursor;
      } else {
        break;
      }
    }
    task.fromBlockNumber = toBlock + 1;
    return null;
  }

  async updateUIAndStorage(task, txHash, toAccount, value) {
    this.eventService.emitEvent("RedeemTxHash", { ccTaskId: task.ccTaskId, txHash, toAccount: toAccount || "", value: value || task.value });
    let storageService = this.frameworkService.getService("StorageService");
    await storageService.delete("ScEventScanService", task.uniqueID);
  }
}

export default CheckSuiTx;
