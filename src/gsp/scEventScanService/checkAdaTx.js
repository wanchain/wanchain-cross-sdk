"use strict";

const axios = require("axios");

module.exports = class CheckAdaTx {
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
  }

  async add(obj) {
    try {
      // console.debug("checkAdaTx add obj: %O", obj);
      this.m_CheckAry.unshift(obj);
    } catch (err) {
      console.error("checkAdaTx add error: %O", err);
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
      let url = this.m_apiServerConfig.url + "/api/ada/queryTxInfoByChainHash/";
      let count = this.m_CheckAry.length;
      for (let idx = 0; idx < count; ++idx) {
        let index = count - idx - 1;
        let obj = this.m_CheckAry[index];
        let txUrl = url + obj.fromChain + "/" + obj.uniqueID;
        let ret = await axios.get(txUrl);
        console.debug("CheckAdaTx %s: %O", txUrl, ret.data);
        if (ret.data.success && ret.data.data) {
          await this.m_eventService.emitEvent("RedeemTxHash", {ccTaskId: obj.ccTaskId, txHash: ret.data.data.txHash, toAccount: ret.data.data.toAddr});
          let storageService = this.m_frameworkService.getService("StorageService");
          storageService.delete("ScEventScanService", obj.uniqueID);
          this.m_CheckAry.splice(index, 1);
        }
      }
    } catch (err) {
      console.error("CheckAdaTx runTask err: %O", err);
    }
  }
};