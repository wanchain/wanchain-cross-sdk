
export default (class CheckSuiTx {
  constructor(frameworkService) {
    this.frameworkService = frameworkService;
    this.eventTasks = new Map();
  }
  async init(chainInfo) {
    this.chainInfo = chainInfo;
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
    }
    catch (err) {
      console.error("CheckSuiTx error: %O", err);
    }
  }
  async processScLogger(taskType) {
    let tasks = this.eventTasks.get(taskType);
    let count = tasks.length;
    if (count === 0) {
      return;
    }
    let latestBlockNumber = await this.iwan.getBlockNumber("SUI"); // scan by cursor, blockNumber only for debug, do not call getChainBlockNumber
    if (latestBlockNumber === 0) { // failed
      console.error("CheckSuiTx %s get latest block number error", taskType);
      return;
    }
    let storageService = this.frameworkService.getService("StorageService");
    for (let i = 0; i < count; i++) {
      let cur = count - i - 1; // backwards
      let task = tasks[cur];
      try {
        let event = null;
        console.debug("CheckSuiTx block %d %s: taskId=%s, uniqueId=%s, cursor=%O", latestBlockNumber, taskType, task.ccTaskId, task.uniqueID, task.fromBlockNumber);
        if (task.taskType === "circleMINT") {
          event = await this.scanCircleEvent(task);
        }
        else {
          event = await this.scanWanBridgeEvent(task);
        }
        if (event) {
          await this.updateUIAndStorage(task, event.txHash, event.toAccount, event.value);
          tasks.splice(cur, 1);
          continue; // skip save task and process next job
        }
      }
      catch (err) {
        console.error("CheckSuiTx block %d %s task %O error: %O", latestBlockNumber, taskType, task, err);
      }
      await storageService.save("ScEventScanService", task.uniqueID, task); // always save regardless of exception
    }
  }
  async scanWanBridgeEvent(task) {
    if (task.fromBlockNumber == 0) { // retry get cursor firstly
      let delay = parseInt((Date.now() - task.ccTaskId) / 1000); // max 50, sui sdk do not throw exception
      let cursor = await this.storemanService.getChainBlockNumber("SUI", { rewind: delay });
      if (cursor) {
        task.fromBlockNumber = cursor;
        console.debug("scanWanBridgeEvent task %d delay %ds retry cursor: %O", task.ccTaskId, delay, cursor);
      }
      else {
        console.error("scanWanBridgeEvent task %d retry cursor error", task.ccTaskId);
        return null;
      }
    }
    let result = await this.iwan.getScEvent("SUI", this.chainInfo.crossScAddr, [], { moduleName: "cross", cursor: task.fromBlockNumber, limit: 1 });
    let ccTxs = result.data;
    for (let tx of ccTxs) {
      let txHash = tx.id.txDigest;
      let receipt = await this.iwan.getTransactionReceipt("SUI", txHash);
      let msgType = (task.taskType === "MINT") ? this.SmgMintMsg : this.SmgReleaseMsg;
      let smgEvent = receipt.events.find(v => ((v.transactionModule === "cross") && (v.type === msgType)));
      if (smgEvent && smgEvent.parsedJson) {
        let uniqueId = '0x' + Buffer.from(smgEvent.parsedJson.unique_id).toString('hex');
        if (uniqueId === task.uniqueID) {
          console.debug("scanWanBridgeEvent task %d tx %s get smgEvent: %O", task.ccTaskId, txHash, smgEvent);
          return { txHash, toAccount: smgEvent.parsedJson.recipient, value: smgEvent.parsedJson.amount };
        }
      }
    }
    task.fromBlockNumber = result.nextCursor;
    return null;
  }
  async scanCircleEvent(task) {
    if (task.fromBlockNumber == 0) { // retry get cursor firstly
      let delay = parseInt((Date.now() - task.ccTaskId) / 1000); // max 50, sui sdk do not throw exception
      let cursor = await this.storemanService.getChainBlockNumber("SUI", { bridge: "Circle", rewind: delay });
      if (cursor) {
        task.fromBlockNumber = cursor;
        console.debug("scanCircleEvent task %d delay %ds retry cursor: %O", task.ccTaskId, delay, cursor);
      }
      else {
        console.error("scanCircleEvent task %d retry cursor error", task.ccTaskId);
        return null;
      }
    }
    if (task.depositNonce === undefined) {
      let deposit = await this.storemanService.parseCctpDeposit(task.fromChain, task.txHash, { ota: task.ota });
      if (deposit.depositNonce !== undefined) {
        task.depositNonce = deposit.depositNonce;
        task.depositAmount = deposit.depositAmount;
      }
      else {
        console.error("scanCircleEvent task %d failed to parseCctpDeposit for chain %s tx %s", task.ccTaskId, task.fromChain, task.txHash);
        return null;
      }
    }
    let result = await this.iwan.getScEvent("SUI", this.chainInfo.CircleBridge.crossScAddr, [], { moduleName: "fee_collector", cursor: task.fromBlockNumber, limit: 1 });
    let ccTxs = result.data;
    for (let tx of ccTxs) {
      let txHash = tx.id.txDigest;
      let receipt = await this.iwan.getTransactionReceipt("SUI", txHash);
      let receiveEvent = receipt.events.find(v => ((v.transactionModule === "receive_message") && (v.type === this.cctpReceiveMsg)));
      if (receiveEvent && receiveEvent.parsedJson) {
        console.debug("scanCircleEvent task %d tx %s get receiveEvent: %O", task.ccTaskId, txHash, receiveEvent);
        let sourceDomain = receiveEvent.parsedJson.source_domain; // number
        let nonce = receiveEvent.parsedJson.nonce; // string
        if ((sourceDomain == task.depositDomain) && (nonce == task.depositNonce)) {
          return { txHash }; // no value or toAccount
        }
      }
    }
    task.fromBlockNumber = result.nextCursor;
    return null;
  }
  async updateUIAndStorage(task, txHash, toAccount, value) {
    this.eventService.emitEvent("RedeemTxHash", { ccTaskId: task.ccTaskId, txHash, toAccount: toAccount || "", value: value || task.value });
    let storageService = this.frameworkService.getService("StorageService");
    await storageService.delete("ScEventScanService", task.uniqueID);
  }
});
