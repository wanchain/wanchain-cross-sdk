"use strict";

const axios = require("axios");

module.exports = class CheckXrpTx {
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
            let url = this.m_apiServerConfig.url + "/api/xrp/addTxInfo";
            let postJson = {
                xrpAddr: obj.toAddr,
                chainType: obj.fromChain,
                chainAddr: obj.fromAddr,
                chainHash: obj.chainHash
            };
            let ret = await axios.post(url, postJson);
            if (ret.data.success === true) {
                console.log("CheckXrpTx save to apiServer success");
                this.m_CheckAry.unshift(obj);
            }
            else {
                console.log("CheckXrpTx save to apiServer fail");
                // ???
            }
        }
        catch (err) {
            console.log("CheckXrpTx err:", err);
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
            let url = this.m_apiServerConfig.url + "/api/xrp/queryTxAckInfo/";
            let count = this.m_CheckAry.length;
            for (let idx = 0; idx < count; ++idx) {
                let index = count - idx - 1;
                let obj = this.m_CheckAry[index];
                let txUrl = url + obj.uniqueID;
                let ret = await axios.get(txUrl);
                console.debug("checkXrpTx %s ret.data: %O", txUrl, ret.data);
                if (ret.data.success && ret.data.data) {
                    let eventService = this.m_frameworkService.getService("EventService");
                    let data = ret.data.data;
                    await eventService.emitEvent("RedeemTxHash", {ccTaskId: obj.ccTaskId, txHash: data.xrpHash, toAccount: data.xrpAddr, value: data.value});
                    let storageService = this.m_frameworkService.getService("StorageService");
                    await storageService.delete("ScEventScanService", obj.uniqueID);
                    this.m_CheckAry.splice(index, 1);
                }
            }
        }
        catch (err) {
            console.error("CheckXrpTx err: %O", err);
        }
    }
};