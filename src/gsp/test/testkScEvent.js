"use strict";

const Web3 = require("web3");
const web3 = new Web3();
const wanUtil = require("wanchain-util");
let IWanBCConnector = require("./testIWanBCConnector");

module.exports = class CheckScEvent {
    constructor() {
    }

    async init(netInfo) {
        this.m_chainInfo = netInfo.chainInfo;
        let crossScAbiJson = require("../../web/src/config/abi/abi.CrossDelegate.json");
        this.m_chainInfo.crossScAbiJson = crossScAbiJson;

        this.m_iwanBCConnector = new IWanBCConnector(netInfo.iWanOption);
        await this.m_iwanBCConnector.init();
    }
//    btcHash:
//        2d9ab1890c451492d9409f3cd9bad9ec3c1f33d818d259d89406f67b0ecb941f
//    wanchainHash
//       0x7e55590d3f2f1f6d2dd8e915483ec4b1527729d74be590ebc322379247496b20
//       height: 13589326
//    5 秒一块, 1分钟12，一小时720，开始块高度大约:13589326 - 720 = 13588626
    async processSmgMintLogger(obj) {
        console.log("processSmgMintLogger obj", obj);
        let eventHash = this.getSmgMintLoggerTopics();
        try {
            let topics = [eventHash, obj.uniqueID.toLowerCase()];
            console.log("topics:", topics);
            let fromBlockNumber = obj.fromBlockNumber;
            let toBlockNumber = await this.m_iwanBCConnector.getBlockNumber(this.m_chainInfo.chainType);
            console.log("processSmgMintLogger Chain:", this.m_chainInfo.chainType,
                ",fromBlockNumber: ", fromBlockNumber,
                ",toBlockNumber: ", toBlockNumber);

            let events = await this.m_iwanBCConnector.getScEvent(
                this.m_chainInfo.chainType,
                this.m_chainInfo.crossScAddr,
                topics,
                {
                    "fromBlock": fromBlockNumber,
                    "toBlock": toBlockNumber
                }
            );
            console.log("events:", events);
            let decodedEvts = this.parseLogs(events, this.m_chainInfo.crossScAbiJson);
            for (let i = 0; i < decodedEvts.length; ++i) {
                let args = decodedEvts[i].args;
                console.log("processSmgMintLogger args.uniqueID:", args.uniqueID.toLowerCase());
                if (args.uniqueID.toLowerCase() === obj.uniqueID.toLowerCase()) {
                    console.log("processSmgMintLogger find obj:", obj);
                    console.log("processSmgMintLogger find args:", args);

                    break;
                }
            }
        }
        catch (err) {
            console.log("processSmgMintLogger err:", err);
        }
    }

    async processSmgReleaseLogger() {
        let ary = this.m_mapCheckAry.get("BURN");
        if (ary.length === 0) {
            return;
        }
        // console.log("processSmgReleaseLogger ", this.m_chainInfo.chainType, ",ary.length:", ary.length);

        let eventHash = this.getSmgReleaseLoggerTopics();
        let count = ary.length;
        for (let idx = 0; idx < count; ++idx) {
            let index = count - idx - 1;
            let obj = ary[index];
            console.log("processSmgReleaseLogger obj", obj);
            try {
                let topics = [eventHash, obj.uniqueID];
                let fromBlockNumber = obj.fromBlockNumber;
                let toBlockNumber = await this.m_iwanBCConnector.getBlockNumber(this.m_chainInfo.chainType);
                console.log("processSmgReleaseLogger Chain:", this.m_chainInfo.chainType,
                    ",fromBlockNumber: ", fromBlockNumber,
                    ",toBlockNumber: ", toBlockNumber);
                let events = await this.m_iwanBCConnector.getScEvent(
                    this.m_chainInfo.chainType,
                    this.m_chainInfo.crossScAddr,
                    topics,
                    {
                        "fromBlock": fromBlockNumber,
                        "toBlock": toBlockNumber
                    }
                );
                let decodedEvts = this.parseLogs(events, this.m_chainInfo.crossScAbiJson);
                for (let i = 0; i < decodedEvts.length; ++i) {
                    let args = decodedEvts[i].args;
                    console.log("processSmgReleaseLogger args.uniqueID:", args.uniqueID.toLowerCase());
                    if (args.uniqueID.toLowerCase() === obj.uniqueID.toLowerCase()) {
                        console.log("processSmgReleaseLogger find obj:", obj);
                        let uiStrService = this.m_frameworkService.getService("UIStrService");
                        let strSucceeded = uiStrService.getStrByName("Succeeded");
                        this.m_WebStores[this.m_storeName].modifyTradeTaskStatus(obj.ccTaskId, strSucceeded);

                        let eventService = this.m_frameworkService.getService("EventService");
                        await eventService.emitEvent("RedeemTxHash", { "ccTaskId": obj.ccTaskId, "txhash": decodedEvts[i].transactionHash });
                        await eventService.emitEvent("ModifyTradeTaskStatus", obj.ccTaskId);

                        let storageService = this.m_frameworkService.getService("StorageService");
                        await storageService.delete("ScEventScanService", obj.uniqueID);
                        ary.splice(index, 1);
                        break;
                    }
                }
            }
            catch (err) {
                console.log("processSmgReleaseLogger err:", err);
            }
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

    getSmgMintLoggerTopics() {
        let eventHash = this.getEventHash("SmgMintLogger", this.m_chainInfo.crossScAbiJson);
        return eventHash;
    }

    getSmgReleaseLoggerTopics() {
        let eventHash = this.getEventHash("SmgReleaseLogger", this.m_chainInfo.crossScAbiJson);
        return eventHash;
    }

    getEventHash(eventName, contractAbi) {
        return '0x' + wanUtil.sha3(this.getcommandString(eventName, contractAbi)).toString('hex');
    }

    getcommandString(funcName, contractAbi) {
        for (var i = 0; i < contractAbi.length; ++i) {
            let item = contractAbi[i];
            if (item.name == funcName) {
                let command = funcName + '(';
                for (var j = 0; j < item.inputs.length; ++j) {
                    if (j != 0) {
                        command = command + ',';
                    }
                    command = command + item.inputs[j].type;
                }
                command = command + ')';
                return command;
            }
        }
    }
};




