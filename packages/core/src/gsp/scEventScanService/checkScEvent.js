"use strict";

const wanUtil = require("wanchain-util");
const tool = require("../../utils/tool");

const DefaultScanBatchSize = 1000;
const CustomizedScanBatchSize = {
  SGB: 30,
  OKT: 300,
  OKB: 100,
  MATIC: 100,
  SEI: 500
};

const EvmEventTypes = ["MINT", "BURN", "MINTNFT", "BURNNFT", "circleMINT", "cctpV2MINT"];
const AlgoEventTypes = ["algoBURN"];

// CCTP DepositForBurn and MessageReceived has discontinuous indexes, can not get correct hash by getEventHash
// const CctpEvmDepositEventHash = "0x2fa9ca894982930190727e75500a97d8dc500233a5065e0f3126c48fbe0343c0";
const CctpEvmReceiveEventHash = "0x58200b4c34ae05ee816d710053fff3fb75af4395915d3d2a771b24aa10e3cc5d";

module.exports = class CheckScEvent {
  constructor(frameworkService) {
    this.frameworkService = frameworkService;
    this.eventHandler = new Map();
    this.eventTasks = new Map();
  }

  async init(chainInfo) {
    this.chainInfo = chainInfo;
    this.scanBatchSize = CustomizedScanBatchSize[chainInfo.chainType] || DefaultScanBatchSize;
    this.iwan = this.frameworkService.getService("iWanConnectorService");
    this.taskService = this.frameworkService.getService("TaskService");
    this.taskService.addTask(this, this.chainInfo.txScanInterval);
    this.eventService = this.frameworkService.getService("EventService");
    this.configService = this.frameworkService.getService("ConfigService");
    this.storemanService = this.frameworkService.getService("StoremanService");
    this.crossScAbi = this.configService.getAbi("crossSc");
    this.cctpProxyAbi = this.configService.getAbi("cctpProxy");
    this.cctpMessageTransmitterAbi = this.configService.getAbi("cctpMessageTransmitter");
    this.cctpTokenMessengerAbi = this.configService.getAbi("cctpTokenMessenger");
    this.cctpV2ProxyAbi = this.configService.getAbi("cctpV2Proxy");
    this.cctpV2MessageTransmitterAbi = this.configService.getAbi("cctpV2MessageTransmitter");
    this.cctpV2TokenMessengerAbi = this.configService.getAbi("cctpV2TokenMessenger");
    if (chainInfo.chainType === "ALGO") {
      this.eventTypes = AlgoEventTypes;
      this.eventHandler.set("algoBURN", this.processAlgoBurn.bind(this));
      let extension = this.configService.getExtension("ALGO");
      this.smgReleaseCodec = extension.tool.getLogCodec('(string,byte[32],byte[32],uint64,uint64,uint64,address)');
    } else {
      this.eventTypes = EvmEventTypes;
      this.eventHandler.set("MINT", this.processSmgMintLogger.bind(this));
      this.eventHandler.set("BURN", this.processSmgReleaseLogger.bind(this));
      this.eventHandler.set("MINTNFT", this.processSmgMintNft.bind(this));
      this.eventHandler.set("BURNNFT", this.processSmgReleaseNft.bind(this));
      this.eventHandler.set("circleMINT", this.processCircleMint.bind(this));
      this.eventHandler.set("cctpV2MINT", this.processCctpV2Mint.bind(this));
    }
    this.eventTypes.forEach(v => this.eventTasks.set(v, []));
  }

  async add(task) {
    //console.log("CheckScEvent task: %O", task);
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
          let fn = this.eventHandler.get(v);
          if (fn) {
            await fn();
          } else {
            console.error("CheckScEvent unsupported event type: %s", v);
          }
        }
      }
    } catch (err) {
      console.error("%s checkScEvent error: %O", this.chainInfo.chainType, err);
    }
  }

  async processSmgMintLogger() {
    let eventHash = this.getEventHash(this.crossScAbi, "SmgMintLogger");
    let eventName = "SmgMintLogger";
    await this.processScLogger("MINT", eventHash, eventName);
  }

  async processSmgReleaseLogger() {
    let eventHash = this.getEventHash(this.crossScAbi, "SmgReleaseLogger");
    let eventName = "SmgReleaseLogger";
    await this.processScLogger("BURN", eventHash, eventName);
  }

  async processSmgMintNft() {
    let eventHash = this.getEventHash(this.crossScAbi, "SmgMintNFT");
    let eventName = "SmgMintNFT";
    await this.processScLogger("MINTNFT", eventHash, eventName);
  }

  async processSmgReleaseNft() {
    let eventHash = this.getEventHash(this.crossScAbi, "SmgReleaseNFT");
    let eventName = "SmgReleaseNFT";
    await this.processScLogger("BURNNFT", eventHash, eventName);
  }

  async processCircleMint() {
    let eventHash = this.getEventHash(this.cctpMessageTransmitterAbi, "MessageReceived");
    let eventName = "MessageReceived";
    await this.processScLogger("circleMINT", eventHash, eventName);
  }

  async processCctpV2Mint() {
    let eventHash = this.getEventHash(this.cctpV2MessageTransmitterAbi, "MessageReceived");
    let eventName = "MessageReceived";
    await this.processScLogger("cctpV2MINT", eventHash, eventName);
  }

  async processAlgoBurn() {
    let eventHash = ""; // not used
    let eventName = "SmgReleaseLogger";
    await this.processScLogger("algoBURN", eventHash, eventName);
  }

  getEventHash(abi, eventName) {
    let prototype = "";
    for (let i = 0; i < abi.length; ++i) {
      let item = abi[i];
      if (item.name == eventName) {
        prototype = eventName + '(';
        for (let j = 0; j < item.inputs.length; ++j) {
          if (j != 0) {
            prototype = prototype + ',';
          }
          prototype = prototype + item.inputs[j].type;
        }
        prototype = prototype + ')';
        break;
      }
    }
    return '0x' + wanUtil.sha3(prototype).toString('hex');
  }

  async processScLogger(type, eventHash, eventName) {
    let tasks = this.eventTasks.get(type);
    let count = tasks.length;
    if (count === 0) {
      return;
    }
    let latestBlockNumber = await this.storemanService.getChainBlockNumber(this.chainInfo.chainType);
    if (latestBlockNumber === 0) { // failed
      console.error("%s CheckScEvent %s get latest block number error", this.chainInfo.chainType, type);
      return;
    }
    let storageService = this.frameworkService.getService("StorageService");
    for (let i = 0; i < count; i++) {
      let cur = count - i - 1; // backwards
      let task = tasks[cur];
      try {
        if (task.fromBlockNumber == 0) { // retry get block number firstly
          let delay = parseInt((Date.now() - task.ccTaskId) / 1000);
          let blockNumber = latestBlockNumber - delay;
          console.log("%s CheckScEvent task %d %s retry blockNumber %d(+%d)", this.chainInfo.chainType, task.ccTaskId, type, blockNumber, delay);
          if (blockNumber < 0) {
            blockNumber = 1;
          }
          task.fromBlockNumber = blockNumber;
        }
        if ((["circleMINT", "cctpV2MINT"].includes(task.taskType)) && ((task.depositNonce === undefined) || !task.transmitter)) {
          let isV2 = (task.taskType === "cctpV2MINT");
          let [deposit, transmitter] = await Promise.all([
            this.storemanService.parseCctpDeposit(task.fromChain, task.txHash, {ota: task.ota, isV2}),
            this.getCctpMessageTransmitterAddr(isV2)
          ])
          if ((deposit.depositNonce !== undefined) && transmitter) {
            task.depositNonce = deposit.depositNonce;
            task.depositAmount = deposit.depositAmount;
            task.transmitter = transmitter;
          } else { // throw error to save task
            throw new Error(this.chainInfo.chainType + " CheckScEvent task " + task.ccTaskId + " parseCctpDeposit error");
          }
        }
        let fromBlockNumber = task.fromBlockNumber;
        if (latestBlockNumber >= fromBlockNumber) {
          let rewindBlocks = parseInt(this.scanBatchSize * 0.6);
          let toBlockNumber = fromBlockNumber + this.scanBatchSize - 1;
          if (toBlockNumber > latestBlockNumber) {
            toBlockNumber = latestBlockNumber;
          }
          // rewind on recent tx
          if ((toBlockNumber + this.scanBatchSize) > latestBlockNumber) {
            fromBlockNumber = fromBlockNumber - rewindBlocks; // rewind default
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
          /* In theory, uniqueID should be a lowercase hash value with prefix '0x',
             but in historical implementations, some uniqueIDs are uppercase or (and) without '0x', such as Tron and XRP
             so reserve the compatible code temporarily
          */
          let event;
          if (task.taskType === "circleMINT") {
            let topics = [eventHash, undefined, '0x' + Number(task.depositNonce).toString(16).padStart(64, '0')];
            event = await this.scanCircleEvent(fromBlockNumber, toBlockNumber, task.transmitter, topics, task.depositDomain);
          } else if (task.taskType === "cctpV2MINT") {
            let topics = [eventHash, undefined, task.depositNonce];
            event = await this.scanCctpV2Event(fromBlockNumber, toBlockNumber, task.transmitter, topics, task.depositDomain);
          } else if (task.taskType === "algoBURN") {
            event = await this.scanAlgoScEvent(fromBlockNumber, toBlockNumber, task.uniqueID);
          } else if (this.chainInfo.chainType === "TRX") {
            let eventUnique = "0x" + tool.hexStrip0x(task.uniqueID);
            event = await this.scanTrxScEvent(fromBlockNumber, toBlockNumber, eventName, eventHash, eventUnique);
          } else {
            let eventUnique = "0x" + tool.hexStrip0x(task.uniqueID);
            let topics = [eventHash, eventUnique.toLowerCase()];
            event = await this.scanScEvent(fromBlockNumber, toBlockNumber, topics);
          }
          if (event) {
            await this.updateUIAndStorage(task, event.txHash, event.toAccount, event.value);
            tasks.splice(cur, 1);
            continue; // task would be deleted, do not need to save, process next job
          } else { // wait next scan
            task.fromBlockNumber = toBlockNumber + 1;
          }
          console.debug("%s CheckScEvent block %d-%d/%d %s: taskId=%s, uniqueId=%s, ota=%s",
                      this.chainInfo.chainType, fromBlockNumber, toBlockNumber, latestBlockNumber, type, task.ccTaskId, task.uniqueID, task.oneTimeAddr || "n/a");
        } else { // rollback
          task.fromBlockNumber = latestBlockNumber;
          console.debug("%s CheckScEvent no new block %d/%d %s: taskId=%s, uniqueId=%s, ota=%s",
                      this.chainInfo.chainType, fromBlockNumber, latestBlockNumber, type, task.ccTaskId, task.uniqueID, task.oneTimeAddr || "n/a");
        }
      } catch (err) {
        if (err.message === "log is not ready") {
          console.debug("%s CheckScEvent fromBlock %d %s %O error: %s", this.chainInfo.chainType, task.fromBlockNumber, type, task, err.message);
        } else {
          console.error("%s CheckScEvent fromBlock %d %s %O error: %O", this.chainInfo.chainType, task.fromBlockNumber, type, task, err);
        }
      }
      await storageService.save("ScEventScanService", task.uniqueID, task); // always save regardless of exception
    }
  }

  async getCctpMessageTransmitterAddr(isV2) {
    let proxyScAddr = isV2? this.chainInfo.CircleBridge.crossScAddrV2 : this.chainInfo.CircleBridge.crossScAddr;
    let abi = [{ // v1 and v2 have the same abi
      "inputs": [],
      "name": "circleMessageTransmitterSC",
      "outputs": [{
        "internalType": "address",
        "name": "",
        "type": "address"}
      ],
      "stateMutability": "view",
      "type": "function"
    }];
    let addr = await this.iwan.callScFunc(this.chainInfo.chainType, proxyScAddr, "circleMessageTransmitterSC", [], abi);
    console.debug("%s circleMessageTransmitterSC addr: %s", this.chainInfo.chainType, addr);
    return addr;
  }

  async scanCircleEvent(fromBlockNumber, toBlockNumber, sc, topics, depositDomain) {
    let events = await this.iwan.getScEvent(
      this.chainInfo.chainType,
      sc, // cctp transmitter
      topics,
      {
        "fromBlock": fromBlockNumber,
        "toBlock": toBlockNumber
      }
    );
    for (let event of events) {
      let decoded = tool.parseEvmLog(event, this.cctpMessageTransmitterAbi);
      if (Number(decoded.args.sourceDomain) === Number(depositDomain)) {
        let txHash = event.transactionHash;
        let receipt = await this.iwan.getTransactionReceipt(this.chainInfo.chainType, txHash);
        for (let log of receipt.logs) {
          if (log.topics[0] === "0x1b2a7ff080b8cb6ff436ce0372e399692bbfb6d4ae5766fd8d58a7b8cc6142e6") { // MintAndWithdraw
            decoded = tool.parseEvmLog(log, this.cctpTokenMessengerAbi);
            let toAccount = "0x" + decoded.args.mintRecipient.substr(-40);
            return {txHash, toAccount, value: decoded.args.amount};
          }
        }
      }
    }
    return null;
  }

  async scanCctpV2Event(fromBlockNumber, toBlockNumber, sc, topics, depositDomain) {
    let events = await this.iwan.getScEvent(
      this.chainInfo.chainType,
      sc, // cctpV2 transmitter
      topics,
      {
        "fromBlock": fromBlockNumber,
        "toBlock": toBlockNumber
      }
    );
    for (let event of events) {
      let decoded = tool.parseEvmLog(event, this.cctpV2MessageTransmitterAbi);
      if (Number(decoded.args.sourceDomain) === Number(depositDomain)) {
        let txHash = event.transactionHash;
        let receipt = await this.iwan.getTransactionReceipt(this.chainInfo.chainType, txHash);
        for (let log of receipt.logs) {
          if (log.topics[0] === "0x50c55e915134d457debfa58eb6f4342956f8b0616d51a89a3659360178e1ab63") { // MintAndWithdraw
            decoded = tool.parseEvmLog(log, this.cctpV2TokenMessengerAbi);
            let toAccount = "0x" + decoded.args.mintRecipient.substr(-40);
            return {txHash, toAccount, value: decoded.args.amount};
          }
        }
      }
    }
    return null;
  }

  async scanScEvent(fromBlockNumber, toBlockNumber, topics) {
    let events = await this.iwan.getScEvent(
      this.chainInfo.chainType,
      this.chainInfo.crossScAddr,
      topics,
      {
        "fromBlock": fromBlockNumber,
        "toBlock": toBlockNumber
      }
    );
    if (events.length) {
      let log = tool.parseEvmLog(events[0], this.crossScAbi);
      this.extractFields(log);
      return {txHash: log.transactionHash, toAccount: log.args.userAccount, value: log.args.value};
    } else {
      return null;
    }
  }

  async scanTrxScEvent(fromBlock, toBlock, eventName, eventHash, uniqueID) {
    let events = await this.iwan.getScEvent(
      this.chainInfo.chainType,
      this.chainInfo.crossScAddr,
      [],
      {fromBlock, toBlock, eventName}
    );
    for (let i = 0; i < events.length; i++) { // format to standard evm log
      let event = events[i];
      let txInfo = await this.iwan.getTxInfo(this.chainInfo.chainType, event.transaction, {withTopics: true});
      if (!txInfo.log) {
        throw new Error("log is not ready");
      }
      let j = 0;
      for (; j < txInfo.log.length; j++) {
        let txLog = txInfo.log[j];
        if (tool.cmpAddress(txLog.address, this.chainInfo.crossScAddr) && (("0x" + txLog.topics[0]) === eventHash)) {
          Object.assign(event, txLog);
          event.transactionHash = "0x" + event.transaction;
          event.topics = event.topics.map(v => "0x" + v);
          break;
        }
      }
      if (j < txInfo.log.length) {
        let log = tool.parseEvmLog(event, this.crossScAbi);
        let args = log.args;
        if (args.uniqueID.toLowerCase() === uniqueID.toLowerCase()) {
          this.extractFields(log);
          return {txHash: log.transactionHash, toAccount: args.userAccount, value: args.value};
        }
      } else {
        console.error("CheckScEvent can't get %s log data: %O", this.chainInfo.chainType, event);
      }
    }
    return null;
  }

  extractFields(log) {
    // extract required field from array
    let args = log.args;
    if (["SmgMintNFT", "SmgReleaseNFT"].includes(log.eventName)) {
      args.userAccount = args.values[args.keys.indexOf("userAccount:address")];
    }
  }

  async scanAlgoScEvent(fromBlock, toBlock, uniqueID) {
    let events = [], nextToken = "";
    for ( ; nextToken !== undefined; ) {
      let options =  {fromBlock, toBlock};
      if (nextToken) {
        options.nextToken = nextToken;
      }
      let logs = await this.iwan.getScEvent(this.chainInfo.chainType, this.chainInfo.crossScAddr, [], options);
      if (logs['log-data'] && logs['log-data'].length) {
        events.push(...logs['log-data']);
      }
      nextToken = logs['next-token'];
    }
    for (let i = 0; i < events.length; i++) {
      let log = events[i];
      for (let i = 0; i < log.logs.length; i++) {
        let ccInfo = this.algoDecodeSmgReleaseLogger(Buffer.from(log.logs[i], 'base64'), uniqueID);
        if (ccInfo) {
          return {txHash: log.txid, toAccount: ccInfo.to, value: ccInfo.value};
        }
      }
    }
    return null;
  }

  algoDecodeSmgReleaseLogger(u8Array, uniqueID) {
    // class SmgReleaseLogger(abi.NamedTuple):
    //     name:           abi.Field[abi.String]
    //     uniqueID:       abi.Field[abi.StaticBytes[Literal[32]]]
    //     smgID:          abi.Field[abi.StaticBytes[Literal[32]]]
    //     tokenPairID:    abi.Field[abi.Uint64]
    //     value:          abi.Field[abi.Uint64]
    //     tokenAccount:   abi.Field[abi.Uint64]
    //     userAccount:    abi.Field[abi.Address]
    try {
      let decoded = this.smgReleaseCodec.decode(u8Array);
      let [name, u8ArrayUniqueID, u8ArraySmgID, bigIntTokenPairID, bigIntValue, bigIntTokenAccount, userAccount] = decoded;
      if (name === "SmgReleaseLogger") {
        let unique = '0x' + Buffer.from(u8ArrayUniqueID).toString("hex");
        if (unique === uniqueID) {
          // let smg = '0x' + Buffer.from(u8ArraySmgID).toString("hex");
          // let tokenPair = bigIntTokenPairID.toString(10);
          let value = bigIntValue.toString(10);
          // let tokenAccount = bigIntTokenAccount.toString(10);
          return {to: userAccount, value};
        } else {
          return null;
        }
      } else {
        return null;
      }
    } catch (err) {
      return null;
    }
  }

  async updateUIAndStorage(task, txHash, toAccount, value) {
    this.eventService.emitEvent("RedeemTxHash", {ccTaskId: task.ccTaskId, txHash, toAccount, value: value || task.value});
    let storageService = this.frameworkService.getService("StorageService");
    await storageService.delete("ScEventScanService", task.uniqueID);
  }
};