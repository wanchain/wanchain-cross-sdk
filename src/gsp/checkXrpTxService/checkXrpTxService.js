'use strict';

const axios = require("axios");

module.exports = class CheckXrpTxService {
    constructor() {
        this.m_xrpCheckTagAry = [];
    }

    async init(frameworkService) {
        this.m_frameworkService = frameworkService;
        this.m_taskService = frameworkService.getService("TaskService");
        this.m_eventService = frameworkService.getService("EventService");
        this.m_eventService.addEventListener("deleteTask", this.onDeleteTask.bind(this));

        this.m_configService = frameworkService.getService("ConfigService");
        this.m_apiServerConfig = await this.m_configService.getGlobalConfig("apiServer");
    }

    async loadTradeTask(xrpAry) {
        for (let idx = 0; idx < xrpAry.length; ++idx) {
            let obj = xrpAry[idx];
            this.m_xrpCheckTagAry.push(obj);
        }
        
    }

    async start() {
        let checkXrpTxServiceCfg = await this.m_configService.getGlobalConfig("CheckXrpTxService");
        console.log("checkXrpTxServiceCfg:", checkXrpTxServiceCfg);
        this.m_taskService.addTask(this, checkXrpTxServiceCfg.queryActionInfoInterval, "");
    }

    async addTagInfo(obj) {
        //{
        //    "chainType": chainType,
        //    "chainAddr": chainAddr,
        //    "smgPublicKey": storemanGroupPublicKey,
        //    "smgId": storemanGroupId,
        //    "tagId": tagId
        //};
        // console.log("CheckXrpTxService addTagInfo obj:", obj);
        let tmpObj = {
            "ccTaskId": obj.ccTaskId,
            "tagId": obj.tagId,
            "chain": obj.chainType,
            "fromBlockNumber": obj.fromBlockNumber,
            "taskType": "MINT"
        };
        let storageService = this.m_frameworkService.getService("StorageService");
        await storageService.save("CheckXrpTxService", tmpObj.ccTaskId, tmpObj);
        this.m_xrpCheckTagAry.push(tmpObj);
    }

    async runTask(taskPara) {
        let storageService = this.m_frameworkService.getService("StorageService");
        let url = this.m_apiServerConfig.url + "/api/xrp/queryActionInfo/";
        let count = this.m_xrpCheckTagAry.length;
        for (let idx = 0; idx < count; ++idx) {
            let index = count - idx - 1;
            let obj = this.m_xrpCheckTagAry[index];
            try {
                let queryUrl = url + obj.tagId;
                let ret = await axios.get(queryUrl);
                if (ret.data.success === true && ret.data.data !== null) {
                    obj.uniqueID = "0x" + ret.data.data.xrpHash;
                    let eventService = this.m_frameworkService.getService("EventService");
                    await eventService.emitEvent("LockTxHash",
                        {
                            "ccTaskId": obj.ccTaskId,
                            "txhash": ret.data.data.xrpHash,
                            "sentAmount": ret.data.data.sentValue
                        });

                    let scEventScanService = this.m_frameworkService.getService("ScEventScanService");
                    await scEventScanService.add(obj);
                    await this.m_eventService.emitEvent("crossChainTaskSubmitted", obj.ccTaskId);
                    await storageService.delete("CheckXrpTxService", obj.ccTaskId);
                    this.m_xrpCheckTagAry.splice(index, 1);
                }
            }
            catch (err) {
                console.log("CheckXrpTxService runTask err:", err);
            }
        }
    }

    async onDeleteTask(ccTaskId) {
        try {
            for (let idx = 0; idx < this.m_xrpCheckTagAry.length; ++idx) {
                let obj = this.m_xrpCheckTagAry[idx];
                if (obj.ccTaskId === ccTaskId) {
                    this.m_xrpCheckTagAry.splice(idx, 1);
                    let storageService = this.m_frameworkService.getService("StorageService");
                    await storageService.delete("ScEventScanService", obj.ccTaskId);
                    break;
                }
            }
        }
        catch (err) {
            console.log("CheckXrpTxService onDeleteTask err:", err);
        }
    }
};

