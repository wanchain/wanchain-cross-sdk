"use strict";

const Web3 = require("web3");
const web3 = new Web3();
const wanUtil = require("wanchain-util");
const tool = require("../../utils/tool");

module.exports = class CheckScEvent {
    constructor(frameworkService) {
        this.m_frameworkService = frameworkService;
        this.m_mapEventHandler = new Map();
        this.m_mapCheckAry = new Map();
    }

    async init(chainInfo) {
        this.m_chainInfo = chainInfo;
        this.m_mapEventHandler.set("MINT", this.processSmgMintLogger.bind(this));
        this.m_mapEventHandler.set("BURN", this.processSmgReleaseLogger.bind(this));
        this.m_mapCheckAry.set("MINT", []);
        this.m_mapCheckAry.set("BURN", []);
        this.m_iwanBCConnector = this.m_frameworkService.getService("iWanConnectorService");
        this.m_taskService = this.m_frameworkService.getService("TaskService");
        this.m_taskService.addTask(this, this.m_chainInfo.ScScanInfo.taskInterval, "sc event");
        this.m_eventService = this.m_frameworkService.getService("EventService");
        this.m_eventService.addEventListener("deleteTask", this.onDeleteTask.bind(this));
        let configService = this.m_frameworkService.getService("ConfigService");
        this.crossScAbi = ["ETH", "BSC"].includes(chainInfo.chainType)? configService.getAbi("crossSc") : configService.getAbi("crossScLegacyEvent");
    }

    async onDeleteTask(ccTaskId) {
        let ret = await this.deleteTaskById("MINT", ccTaskId);
        if (ret === true) {
            return;
        }
        await this.deleteTaskById("BURN", ccTaskId);
    }

    async deleteTaskById(type, ccTaskId) {
        try {
            let ary = this.m_mapCheckAry.get(type);
            for (let idx = 0; idx < ary.length; ++idx) {
                let obj = ary[idx];
                if (obj.ccTaskId === ccTaskId) {
                    ary.splice(idx, 1);
                    let storageService = this.m_frameworkService.getService("StorageService");
                    storageService.delete("ScEventScanService", obj.uniqueID);
                    return true;
                }
            }
            return false;
        }
        catch (err) {
            console.log("deleteTaskById err:", err);
            return false;
        }
    }

    async add(obj) {
        //console.log("CheckScEvent obj:", obj);
        let ary = this.m_mapCheckAry.get(obj.taskType);
        if (ary) {
            ary.unshift(obj);
            //console.log("this.m_mapCheckAry:", this.m_mapCheckAry);
        }
    }

    async load(obj) {
        await this.add(obj);
    }

    async runTask(taskPara) {
        try {
            let connected = await this.m_iwanBCConnector.isConnected();
            if (connected === false) {
                //console.log("CheckScEvent runTask iwan no connect");
                return;
            }

            let processFun = this.m_mapEventHandler.get("MINT");
            if (processFun) {
                await processFun();
            }

            processFun = this.m_mapEventHandler.get("BURN");
            if (processFun) {
                await processFun();
            }
        } catch (err) {
            console.log("checkScEvent chainType:", this.m_chainInfo.chainType, ",err:", err);
        }
    }

  async processSmgMintLogger() {
    //console.log("processSmgMintLogger ", this.m_chainInfo.chainType, ",ary.length:", ary.length);
    let eventHash = this.getEventHash("SmgMintLogger");
    let eventName = "SmgMintLogger";
    await this.processScLogger("MINT", eventHash, eventName);
  }

  async processSmgReleaseLogger() {
    let eventHash = this.getEventHash("SmgReleaseLogger");
    let eventName = "SmgReleaseLogger";
    await this.processScLogger("BURN", eventHash, eventName);
  }

  checkIsExistTask() {
    let aryMint = this.m_mapCheckAry.get("MINT");
    let aryBurn = this.m_mapCheckAry.get("BURN");
    if ((aryMint.length === 0) && (aryBurn.length === 0)) {
      return false;
    } else {
      return true;
    }
  }

  parseLogs(logs, abi) {
      if (logs === null || !Array.isArray(logs)) {
          return logs;
      }
      return logs.map(function (log) {
          let abiJson = abi.find(function (json) {
              return (json.type === 'event' && web3.eth.abi.encodeEventSignature(json) === log.topics[0]);
          });

          if (abiJson) {
              try {
                  //topics without the topic[0] if its a non-anonymous event, otherwise with topic[0].
                  log.topics.splice(0, 1);
                  let args = web3.eth.abi.decodeLog(abiJson.inputs, log.data, log.topics);
                  for (var index = 0; index < abiJson.inputs.length; index++) {
                      if (args.hasOwnProperty(index)) {
                          delete args[index];
                      }
                  }
                  log.eventName = abiJson.name;
                  log.args = args;
                  return log;
              } catch (err) {
                  console.log(err);
                  return log;
              }
          } else {
              return log;
          }
      });
  }

  getEventHash(eventName) {
      let prototype = "";
      for (let i = 0; i < this.crossScAbi.length; ++i) {
          let item = this.crossScAbi[i];
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
    let ary = this.m_mapCheckAry.get(type);
    let count = ary.length;
    if (count === 0) {
      return;
    }
    for (let idx = 0; idx < count; idx++) {
      let cur = count - idx - 1; // backwards
      let obj = ary[cur];
      try {
        let eventUnique = "0x" + tool.hexStrip0x(obj.uniqueID);
        let topics = [eventHash, eventUnique.toLowerCase()];
        let latestBlockNumber = await this.m_iwanBCConnector.getBlockNumber(this.m_chainInfo.chainType);
        let fromBlockNumber = obj.fromBlockNumber;
        let toBlockNumber = fromBlockNumber;
        if (latestBlockNumber >= fromBlockNumber) {
          toBlockNumber = fromBlockNumber + 500; // some chain limit to 1000
          if (toBlockNumber > latestBlockNumber) {
            toBlockNumber = latestBlockNumber;
          }
          try {
            let event;
            if (this.m_chainInfo.chainType === "TRX") {
              event = await this.scanTrxScEvent(fromBlockNumber, toBlockNumber, eventName, eventHash, eventUnique);
            } else {
              event = await this.scanScEvent(fromBlockNumber, toBlockNumber, topics, eventUnique);
            }
            if (event) {
              await this.updateUIAndStorage(obj, event.txHash, event.toAccount);
              ary.splice(cur, 1);
            } else { // wait next scan
              obj.fromBlockNumber = toBlockNumber + 1;
            }
          } catch (err) {
            // console.error("processScLogger %s %O error: %O", type, obj, err);
          }
        } else { // rollback
          obj.fromBlockNumber = latestBlockNumber;
        }
        console.debug("%s blockNumber %d-%d/%d processScLogger %s: taskId=%s, uniqueId=%s, ota=%s",
                      this.m_chainInfo.chainType, fromBlockNumber, toBlockNumber, latestBlockNumber, type, obj.ccTaskId, obj.uniqueID, obj.oneTimeAddr || "n/a");
      } catch (err) {
        console.error("processScLogger %s %O error: %O", type, obj, err);
      }
    }
  }

  async scanScEvent(fromBlockNumber, toBlockNumber, topics, uniqueID) {
    let events = await this.m_iwanBCConnector.getScEvent(
      this.m_chainInfo.chainType,
      this.m_chainInfo.crossScAddr,
      topics,
      {
        "fromBlock": fromBlockNumber,
        "toBlock": toBlockNumber
      }
    );
    let decodedEvts = this.parseLogs(events, this.crossScAbi);
    for (let i = 0; i < decodedEvts.length; ++i) {
      let args = decodedEvts[i].args;
      if (args.uniqueID.toLowerCase() === uniqueID.toLowerCase()) {
        return {txHash: decodedEvts[i].transactionHash, toAccount: args.userAccount};
      }
    }
    return null;
  }

  async scanTrxScEvent(fromBlock, toBlock, eventName, eventHash, uniqueID) {
    let events = await this.m_iwanBCConnector.getScEvent(
      this.m_chainInfo.chainType,
      this.m_chainInfo.crossScAddr,
      [],
      {fromBlock, toBlock, eventName}
    );
    for (let i = 0; i < events.length; i++) {
      let event = events[i];
      let txInfo = await this.m_iwanBCConnector.getTxInfo(this.m_chainInfo.chainType, event.transaction, {withTopics: true});
      if (!txInfo.log) {
        throw new Error("log is not ready");
      }
      let j = 0;
      for (; j < txInfo.log.length; j++) {
        let txLog = txInfo.log[j];
        if (tool.cmpAddress(txLog.address, this.m_chainInfo.crossScAddr) && (("0x" + txLog.topics[0]) === eventHash)) {
          Object.assign(event, txLog);
          event.transactionHash = "0x" + event.transaction;
          event.topics = event.topics.map(v => "0x" + v);
          break;
        }
      }
      if (j === txInfo.log.length) {
        console.error("can't get %s log data: %O", this.m_chainInfo.chainType, event);
      }
    }
    let decodedEvts = this.parseLogs(events, this.crossScAbi);
    for (let i = 0; i < decodedEvts.length; ++i) {
      let args = decodedEvts[i].args;
      if (args.uniqueID.toLowerCase() === uniqueID.toLowerCase()) {
        return {txHash: decodedEvts[i].transactionHash, toAccount: args.userAccount};
      }
    }
    return null;
  }

  async updateUIAndStorage(obj, txHash, toAccount) {
    try {
      this.m_eventService.emitEvent("RedeemTxHash", {ccTaskId: obj.ccTaskId, txHash, toAccount});
      let storageService = this.m_frameworkService.getService("StorageService");
      await storageService.delete("ScEventScanService", obj.uniqueID);
    } catch (err) {
      console.error("updateUIAndStorage error: %O", err);
    }
  }
};