"use strict";

const axios = require("axios");

module.exports = class CheckDotTx {
  constructor(frameworkService) {
    this.m_frameworkService = frameworkService;
    this.m_CheckAry = [];
  }

  async init(chainType) {
    this.m_taskService = this.m_frameworkService.getService("TaskService");

    this.m_configService = this.m_frameworkService.getService("ConfigService");
    this.m_apiServerConfig = await this.m_configService.getGlobalConfig("apiServer");

    let chainInfoService = this.m_frameworkService.getService("ChainInfoService");
    let chainInfo = await chainInfoService.getChainInfoByType(chainType);

    this.m_taskService.addTask(this, chainInfo.TxScanInfo.taskInterval, "tx");
    this.m_eventService = this.m_frameworkService.getService("EventService");
    this.m_eventService.addEventListener("deleteTask", this.onDeleteTask.bind(this));
  }

  async onDeleteTask(ccTaskId) {
    try {
      let ary = this.m_CheckAry;
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
    try {
      console.log("checkDotTx add obj:", obj);
      this.m_CheckAry.unshift(obj);
    }
    catch (err) {
      console.log("checkDotTx add err:", err);
    }
  }

  async load(obj) {
    this.m_CheckAry.unshift(obj);
  }

  async runTask(taskPara) {
    try {
      if (this.m_CheckAry.length <= 0) {
        return;
      }
      let url = this.m_apiServerConfig.url + "/api/dot/queryTxInfoByChainHash/";
      let count = this.m_CheckAry.length;
      for (let idx = 0; idx < count; ++idx) {
        let index = count - idx - 1;
        let obj = this.m_CheckAry[index];
        let txUrl = url + obj.fromChain + "/" + obj.uniqueID;
        let ret = await axios.get(txUrl);
        console.debug("CheckDotTx %s ret.data: %O", txUrl, ret.data);
        if (ret.data.success === true) {
          if (ret.data.data) {
            // found
            console.log("checkDotTx ret.data.data.txHash:", ret.data.data.txHash);
            await this.m_eventService.emitEvent("RedeemTxHash", {ccTaskId: obj.ccTaskId, txhash: ret.data.data.txHash, toAccount: ret.data.data.toAddr});
            let storageService = this.m_frameworkService.getService("StorageService");
            storageService.delete("ScEventScanService", obj.uniqueID);
            this.m_CheckAry.splice(index, 1);
          }
        }
      }
    }
    catch (err) {
      console.error("CheckDotTx runTask err: %O", err);
    }
  }
};




