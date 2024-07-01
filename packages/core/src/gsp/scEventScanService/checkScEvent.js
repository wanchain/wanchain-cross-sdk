"use strict";

const wanUtil = require("wanchain-util");
const tool = require("../../utils/tool");

const EvmEventTypes = ["MINT", "BURN", "MINTNFT", "BURNNFT", "circleMINT"];
const AlgoEventTypes = ["algoBURN"];

// CCTP DepositForBurn and MessageReceived has discontinuous indexes, can not get correct hash by getEventHash
const CctpEvmDepositEventHash = "0x2fa9ca894982930190727e75500a97d8dc500233a5065e0f3126c48fbe0343c0";
const CctpEvmReceiveEventHash = "0x58200b4c34ae05ee816d710053fff3fb75af4395915d3d2a771b24aa10e3cc5d";

module.exports = class CheckScEvent {
  constructor(frameworkService) {
    this.frameworkService = frameworkService;
    this.mapEventHandler = new Map();
    this.mapCheckArray = new Map();
  }

  async init(chainInfo) {
    this.chainInfo = chainInfo;
    this.scanBatchSize = (chainInfo.chainType === "SGB")? 30 : 300; // OKTC limit 300
    this.iwan = this.frameworkService.getService("iWanConnectorService");
    this.taskService = this.frameworkService.getService("TaskService");
    this.taskService.addTask(this, this.chainInfo.ScScanInfo.taskInterval);
    this.eventService = this.frameworkService.getService("EventService");
    this.configService = this.frameworkService.getService("ConfigService");
    this.storemanService = this.frameworkService.getService("StoremanService");
    this.crossScAbi = this.configService.getAbi("crossSc");
    this.circleBridgeProxyAbi = this.configService.getAbi("circleBridgeProxy");
    this.circleBridgeDepositAbi = this.configService.getAbi("circleBridgeDeposit");
    this.circleBridgeReceiveAbi = this.configService.getAbi("circleBridgeReceive");
    if (chainInfo.chainType === "ALGO") {
      this.eventTypes = AlgoEventTypes;
      this.mapEventHandler.set("algoBURN", this.processAlgoBurn.bind(this));
      let extension = this.configService.getExtension("ALGO");
      this.smgReleaseCodec = extension.tool.getLogCodec('(string,byte[32],byte[32],uint64,uint64,uint64,address)');
    } else {
      this.eventTypes = EvmEventTypes;
      this.mapEventHandler.set("MINT", this.processSmgMintLogger.bind(this));
      this.mapEventHandler.set("BURN", this.processSmgReleaseLogger.bind(this));
      this.mapEventHandler.set("MINTNFT", this.processSmgMintNft.bind(this));
      this.mapEventHandler.set("BURNNFT", this.processSmgReleaseNft.bind(this));
      this.mapEventHandler.set("circleMINT", this.processCircleMint.bind(this));
    }
    this.eventTypes.forEach(v => this.mapCheckArray.set(v, []));
  }

  async add(obj) {
    //console.log("CheckScEvent obj:", obj);
    let ary = this.mapCheckArray.get(obj.taskType);
    if (ary) {
      ary.unshift(obj);
      //console.log("this.mapCheckArray:", this.mapCheckArray);
    }
  }

  async load(obj) {
    await this.add(obj);
  }

  async runTask(taskPara) {
    try {
      let connected = await this.iwan.isConnected();
      if (connected) {
        for (let v of this.eventTypes) {
          let fn = this.mapEventHandler.get(v);
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
    //console.log("processSmgMintLogger ", this.chainInfo.chainType, ",ary.length:", ary.length);
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
    let eventHash = this.getEventHash(this.circleBridgeProxyAbi, "MintToken");
    let eventName = "MintToken";
    await this.processScLogger("circleMINT", eventHash, eventName);
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
    let ary = this.mapCheckArray.get(type);
    let count = ary.length;
    if (count === 0) {
      return;
    }
    let storageService = this.frameworkService.getService("StorageService");
    for (let idx = 0; idx < count; idx++) {
      let cur = count - idx - 1; // backwards
      let obj = ary[cur];
      try {
        if (obj.fromBlockNumber == 0) { // retry get block number firstly
          let delay = parseInt((Date.now() - obj.ccTaskId) / 1000);
          let blockNumber = await this.storemanService.getChainBlockNumber(this.chainInfo.chainType);
          console.log("task %d processScLogger %s delay %ds retry %s blockNumber: %d", obj.ccTaskId, type, delay, this.chainInfo.chainType, blockNumber);
          if (blockNumber) {
            blockNumber = blockNumber - delay;
            if (blockNumber < 0) {
              blockNumber = 1;
            }
            obj.fromBlockNumber = blockNumber;
            await storageService.save("ScEventScanService", obj.uniqueID, obj);
          } else {
            throw new Error("task " + task.ccTaskId + " retry block number error");
          }
        }
        await this.prepareTask(obj);
        let latestBlockNumber = await this.iwan.getBlockNumber(this.chainInfo.chainType);
        let fromBlockNumber = obj.fromBlockNumber - 30; // for rollback
        if (fromBlockNumber < 1) {
          fromBlockNumber = 1;
        }
        let toBlockNumber = fromBlockNumber;
        if (latestBlockNumber >= fromBlockNumber) {
          toBlockNumber = fromBlockNumber + this.scanBatchSize;
          if (toBlockNumber > latestBlockNumber) {
            toBlockNumber = latestBlockNumber;
          }
          /* In theory, uniqueID should be a lowercase hash value with prefix '0x',
             but in historical implementations, some uniqueIDs are uppercase or (and) without '0x', such as Tron and XRP
             so reserve the compatible code temporarily
          */
          let event;
          if (obj.taskType === "circleMINT") {
            let topics = [eventHash];
            event = await this.scanCircleEvent(fromBlockNumber, toBlockNumber, topics, obj.depositDomain, obj.depositNonce);
          } else if (obj.taskType === "algoBURN") {
            event = await this.scanAlgoScEvent(fromBlockNumber, toBlockNumber, obj.uniqueID);
          } else if (this.chainInfo.chainType === "TRX") {
            let eventUnique = "0x" + tool.hexStrip0x(obj.uniqueID);
            event = await this.scanTrxScEvent(fromBlockNumber, toBlockNumber, eventName, eventHash, eventUnique);
          } else {
            let eventUnique = "0x" + tool.hexStrip0x(obj.uniqueID);
            let topics = [eventHash, eventUnique.toLowerCase()];
            event = await this.scanScEvent(fromBlockNumber, toBlockNumber, topics);
          }
          if (event) {
            await this.updateUIAndStorage(obj, event.txHash, event.toAccount, event.value);
            ary.splice(cur, 1);
            continue; // process next job
          } else { // wait next scan
            obj.fromBlockNumber = toBlockNumber + 1;
          }
        } else { // rollback
          obj.fromBlockNumber = latestBlockNumber;
        }
        console.debug("%s block %d-%d/%d processScLogger %s: taskId=%s, uniqueId=%s, ota=%s",
                      this.chainInfo.chainType, fromBlockNumber, toBlockNumber, latestBlockNumber, type, obj.ccTaskId, obj.uniqueID, obj.oneTimeAddr || "n/a");
        await storageService.save("ScEventScanService", obj.uniqueID, obj);
      } catch (err) {
        if (err.message === "log is not ready") {
          console.debug("%s fromBlock %d processScLogger %s %O error: %s", this.chainInfo.chainType, obj.fromBlockNumber, type, obj, err.message);
        } else {
          console.error("%s fromBlock %d processScLogger %s %O error: %O", this.chainInfo.chainType, obj.fromBlockNumber, type, obj, err);
        }
      }
    }
  }

  async prepareTask(task) {
    if ((task.taskType === "circleMINT") && (task.depositNonce === undefined)) {
      let receipt = await this.iwan.getTransactionReceipt(task.fromChain, task.txHash);
      if (task.fromChain === "NOBLE") {
        let event = receipt.events.find(v => (v.type === "circle.cctp.v1.DepositForBurn"));
        if (event) {
          console.debug("%s prepareTask for chain %s tx %s: %O", task.taskType, task.fromChain, task.uniqueID, event);
          let nonce = null, amount = null;
          for (let attr of event.attributes) {
            if (attr.key === "nonce") {
              nonce = attr.value; // string
            } else if (attr.key === "amount") {
              amount = attr.value; // string
            }
            if (nonce && amount) {
              task.depositNonce = nonce.replace(/\"/g, "");
              task.depositAmount = amount.replace(/\"/g, "");
              break;
            }
          }
        }
      } else if (task.fromChain === "SOL") {
        let depositMsg = await this.iwan.parseCctpMessageSent("SOL", task.ota);
        let sol = this.configService.getExtension("SOL");
        let cctpMsg = sol.tool.parseCctpDepositMessage(depositMsg);
        console.log("SOL tx %s evnet %s cctpMsg: %O", task.txHash, task.ota, cctpMsg);
        if (cctpMsg) {
          task.depositNonce = parseInt("0x" + cctpMsg.nonce.toString("hex"));
          task.depositAmount = parseInt("0x" + cctpMsg.amount.toString("hex"));
        }
      } else {
        for (let log of receipt.logs) {
          if (log.topics[0] === CctpEvmDepositEventHash) {
            let decoded = tool.parseEvmLog(log, this.circleBridgeDepositAbi);
            console.debug("%s prepareTask for chain %s tx %s: %O", task.taskType, task.fromChain, task.uniqueID, decoded);
            task.depositNonce = decoded.args.nonce;
            task.depositAmount = decoded.args.amount;
            break;
          }
        }
      }
      if (task.depositNonce === undefined) {
        throw new Error("task " + task.ccTaskId + " get deposit nonce error");
      }
    }
  }

  async scanCircleEvent(fromBlockNumber, toBlockNumber, topics, depositDomain, depositNonce) {
    let events = await this.iwan.getScEvent(
      this.chainInfo.chainType,
      this.chainInfo.CircleBridge.crossScAddr, // proxy address
      topics,
      {
        "fromBlock": fromBlockNumber,
        "toBlock": toBlockNumber
      }
    );
    if (events.length) {
      let txHash = events[0].transactionHash;
      let mintEventDecoded = tool.parseEvmLog(events[0], this.circleBridgeProxyAbi);
      let receipt = await this.iwan.getTransactionReceipt(this.chainInfo.chainType, txHash);
      let toAccount = "";
      for (let log of receipt.logs) {
        if (log.topics[0] === CctpEvmReceiveEventHash) {
          let decoded = tool.parseEvmLog(log, this.circleBridgeReceiveAbi);
          if ((decoded.args.sourceDomain == depositDomain) && (decoded.args.nonce == depositNonce)) {
            toAccount = "0x" + mintEventDecoded.args.mintRecipient.substr(-40);
            break;
          }
        }
      }
      if (toAccount) {
        return {txHash, toAccount}; // no value
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
        console.error("can't get %s log data: %O", this.chainInfo.chainType, event);
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

  async updateUIAndStorage(obj, txHash, toAccount, value) {
    this.eventService.emitEvent("RedeemTxHash", {ccTaskId: obj.ccTaskId, txHash, toAccount, value: value || obj.value});
    let storageService = this.frameworkService.getService("StorageService");
    await storageService.delete("ScEventScanService", obj.uniqueID);
  }
};