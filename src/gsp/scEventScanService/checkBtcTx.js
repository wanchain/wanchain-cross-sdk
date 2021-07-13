"use strict";

const axios = require("axios");

module.exports = class CheckBtcTx{
    constructor(frameworkService) {
        this.m_frameworkService = frameworkService;
        this.m_CheckAry = [];
    }

    async init() {
        this.m_WebStores = this.m_frameworkService.getService("WebStores");
        this.m_storeName = "crossChainTaskRecords";
        this.m_taskService = this.m_frameworkService.getService("TaskService");

        this.m_configService = this.m_frameworkService.getService("ConfigService");
        this.m_WebStores = this.m_frameworkService.getService("WebStores");
        this.m_apiServerConfig = await this.m_configService.getGlobalConfig("apiServer");

        let txScanInfo = await this.m_configService.getConfig("ScEventScanService", "BtcTxScanInfo");

        this.m_taskService.addTask(this, txScanInfo.taskInterval, "btc tx");
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
            console.log("checkBtcTx add obj:", obj);
            let url = this.m_apiServerConfig.url + "/api/btc/addTxInfo";
            let postJson = {
                btcAddr: obj.toAddr,
                chainType: obj.fromChain,
                chainAddr: obj.fromAddr,
                chainHash: obj.chainHash
            };
            let ret = await axios.post(url, postJson);
            if (ret.data.success === true) {
                console.log("CheckBtcTx save to apiServer success");
                this.m_CheckAry.unshift(obj);
            }
            else {
                console.log("CheckBtcTx save to apiServer fail");
                // ???
            }
        }
        catch (err) {
            console.log("checkBtcTx add err:", err);
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
            let url = this.m_apiServerConfig.url + "/api/btc/queryTxAckInfo/";
            let count = this.m_CheckAry.length;
            for (let idx = 0; idx < count; ++idx) {
                let index = count - idx - 1;
                let obj = this.m_CheckAry[index];
                let txUrl = url + obj.uniqueID;
                console.log("checkBtcTx index:", index, ",txUrl:", txUrl);
                let ret = await axios.get(txUrl);
                console.log("checkBtcTx ret.data:", ret.data);
                if (ret.data.success === true) {
                    if (ret.data.data) {
                        // found
                        let uiStrService = this.m_frameworkService.getService("UIStrService");
                        let strSucceeded = uiStrService.getStrByName("Succeeded");
                        this.m_WebStores[this.m_storeName].modifyTradeTaskStatus(obj.ccTaskId, strSucceeded);

                        let eventService = this.m_frameworkService.getService("EventService");
                        await eventService.emitEvent("RedeemTxHash", { "ccTaskId": obj.ccTaskId, "txhash": ret.data[0] });
                        await eventService.emitEvent("ModifyTradeTaskStatus", obj.ccTaskId);

                        let storageService = this.m_frameworkService.getService("StorageService");
                        storageService.delete("ScEventScanService", obj.uniqueID);
                        this.m_CheckAry.splice(index, 1);
                    }
                }
            }
        }
        catch (err) {
            console.log("CheckBtcTx runTask err:", err);
        }
    }
};




