"use strict";

const axios = require("axios");

module.exports = class CheckTxBase{
    constructor(frameworkService) {
        this.m_frameworkService = frameworkService;
        this.m_CheckAry = [];
    }

  async init(chainType) {
        this.m_WebStores = this.m_frameworkService.getService("WebStores");
        this.m_storeName = "crossChainTaskRecords";
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

    async load(obj) {
        this.m_CheckAry.unshift(obj);
    }
};




