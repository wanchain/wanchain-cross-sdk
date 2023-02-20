'use strict';

const axios = require("axios");
const tool = require("../../utils/tool.js");

module.exports = class CheckXrpTxService {
    constructor() {
        this.m_xrpCheckTagAry = [];
    }

    async init(frameworkService) {
        this.m_frameworkService = frameworkService;
        this.m_taskService = frameworkService.getService("TaskService");
        this.m_eventService = frameworkService.getService("EventService");
        this.m_configService = frameworkService.getService("ConfigService");
        this.m_apiServerConfig = await this.m_configService.getGlobalConfig("apiServer");
        this.lockTxTimeout = await this.m_configService.getGlobalConfig("LockTxTimeout");
    }

    async loadTradeTask(xrpAry) {
        for (let idx = 0; idx < xrpAry.length; ++idx) {
            let obj = xrpAry[idx];
            this.m_xrpCheckTagAry.push(obj);
        }
        
    }

    async start() {
        let checkXrpTxServiceCfg = await this.m_configService.getGlobalConfig("CheckXrpTxService");
        // console.debug("checkXrpTxServiceCfg:", checkXrpTxServiceCfg);
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
                console.debug("CheckXrpTxService queryUrl:", queryUrl);
                let ret = await axios.get(queryUrl);
                if (ret.data.success === true && ret.data.data !== null) {
                    obj.uniqueID = "0x" + ret.data.data.xrpHash;
                    await this.m_eventService.emitEvent("LockTxHash", {
                        ccTaskId: obj.ccTaskId,
                        txHash: ret.data.data.xrpHash,
                        sentAmount: ret.data.data.sentValue,
                        sender: ret.data.data.xrpAddr
                    });
                    let scEventScanService = this.m_frameworkService.getService("ScEventScanService");
                    await scEventScanService.add(obj);
                    await storageService.delete("CheckXrpTxService", obj.ccTaskId);
                    this.m_xrpCheckTagAry.splice(index, 1);
                } else if (tool.checkTimeout(obj.ccTaskId, this.lockTxTimeout)) {
                    console.debug("task %s wait lock tx timeout", obj.ccTaskId);
                    await this.m_eventService.emitEvent("LockTxTimeout", {
                        ccTaskId: obj.ccTaskId
                    });
                    // DO NOT delete from storage, can be resumed by refreshing page
                    this.m_xrpCheckTagAry.splice(index, 1);
                }
            }
            catch (err) {
                console.error("CheckXrpTxService runTask err:", err);
            }
        }
    }
};