"use strict";

const axios = require("axios");

module.exports = class CheckApiServerTx {
  constructor(frameworkService, chainType) {
    this.m_frameworkService = frameworkService;
    this.chainType = chainType;
    this.serviceName = "Check" + chainType.charAt(0).toUpperCase() + chainType.substr(1).toLowerCase() + "Tx";
    this.m_CheckAry = [];
  }

  async init() {
    this.m_taskService = this.m_frameworkService.getService("TaskService");

    this.m_configService = this.m_frameworkService.getService("ConfigService");
    this.m_apiServerConfig = this.m_configService.getGlobalConfig("apiServer");

    let chainInfoService = this.m_frameworkService.getService("ChainInfoService");
    let chainInfo = chainInfoService.getChainInfoByType(this.chainType);

    if (chainInfo) { // maybe not configured on mainnet
      this.m_taskService.addTask(this, chainInfo.TxScanInfo.taskInterval);
    }

    this.m_eventService = this.m_frameworkService.getService("EventService");
  }

  async add(obj) {
    try {
      console.debug("%s add obj:", this.serviceName, obj);
      this.m_CheckAry.unshift(obj);
    } catch (err) {
      console.error("%s add error: %O", this.serviceName, err);
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
      let url = this.m_apiServerConfig.url + "/api/" + this.chainType.toLowerCase() + "/queryTxInfoByChainHash/";
      let count = this.m_CheckAry.length;
      for (let idx = 0; idx < count; ++idx) {
        let index = count - idx - 1;
        let obj = this.m_CheckAry[index];
        let txUrl = url + obj.fromChain + "/" + obj.uniqueID;
        let ret = await axios.get(txUrl);
        console.debug("%s %s ret.data: %O", this.serviceName, txUrl, ret.data);
        if (ret.data.success && ret.data.data) {
          let data = ret.data.data;
          // when noble cctp claim tx is sent by other provider, value and toAccount are invalid
          let toAccount = data.txHash? data.toAddr : "";
          let value = data.txHash? data.value : "";
          await this.m_eventService.emitEvent("RedeemTxHash", {ccTaskId: obj.ccTaskId, txHash: data.txHash, toAccount, value});
          let storageService = this.m_frameworkService.getService("StorageService");
          storageService.delete("ScEventScanService", obj.uniqueID);
          this.m_CheckAry.splice(index, 1);
        }
      }
    } catch (err) {
      console.error("%s runTask err: %O", this.serviceName, err);
    }
  }
};