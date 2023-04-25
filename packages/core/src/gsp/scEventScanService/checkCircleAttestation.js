"use strict";

const axios = require("axios");
const Web3 = require("web3");
const web3 = new Web3();

module.exports = class CheckCircleAttestation {
  constructor(frameworkService) {
    this.frameworkService = frameworkService;
    this.checkArray = [];
  }

  async init() {
    this.taskService = this.frameworkService.getService("TaskService");
    this.configService = this.frameworkService.getService("ConfigService");
    this.circleBridgeServer = this.configService.getGlobalConfig("circleBridgeServer");
    this.taskService.addTask(this, 3000);
    this.eventService = this.frameworkService.getService("EventService");
    this.iwan = this.frameworkService.getService("iWanConnectorService");
  }

  async add(obj) {
    this.checkArray.unshift(obj);
  }

  async load(obj) {
    this.checkArray.unshift(obj);
  }

  async runTask(taskPara) {
    try {
      if (this.checkArray.length <= 0) {
        return;
      }
      let count = this.checkArray.length;
      for (let idx = 0; idx < count; ++idx) {
        let index = count - idx - 1;
        let obj = this.checkArray[index];
        if (!obj.claim) {
          obj.claim = await this.fecthMessageAndHash(obj.fromChain, obj.chainHash);
          let storageService = this.frameworkService.getService("StorageService");
          await storageService.save("ScEventScanService", obj.uniqueID, obj); 
        }
        let url = this.circleBridgeServer + "/" + obj.claim.msgHash;
        let ret = await axios.get(url);
        console.debug("CheckCircleAttestation %s ret.data: %O", url, ret.data);
        if ((ret.data.status === "complete") && ret.data.attestation) {
          obj.claim.attestation = ret.data.attestation;
          let eventService = this.frameworkService.getService("EventService");
          await eventService.emitEvent("Claimable", {ccTaskId: obj.ccTaskId, data: obj.claim});
          let storageService = this.frameworkService.getService("StorageService");
          await storageService.delete("ScEventScanService", obj.uniqueID);
          this.checkArray.splice(index, 1);
        }
      }
    } catch (err) {
      console.error("CheckCircleAttestation error: %O", err);
    }
  }

  async fecthMessageAndHash(chainType, txHash) {
    const receipt = await this.iwan.getTransactionReceipt(chainType, txHash);
    const eventTopic = web3.utils.keccak256('MessageSent(bytes)');
    const log = receipt.logs.find((l) => l.topics[0] === eventTopic);
    const messageBytes = web3.eth.abi.decodeParameters(['bytes'], log.data)[0];
    const messageHash = web3.utils.keccak256(messageBytes);
    console.debug("CheckCircleAttestation %s %s fecthMessageHash: %s", chainType, txHash, messageHash);
    return {msg: messageBytes, msgHash: messageHash};
  }
};