'use strict';

const axios = require("axios");

module.exports = class CheckLtcTxService {
    constructor() {
        this.m_ltcCheckOTAAry = [];
    }

    async init(frameworkService) {
        this.m_frameworkService = frameworkService;
        this.m_taskService = frameworkService.getService("TaskService");
        this.m_eventService = frameworkService.getService("EventService");
        this.m_eventService.addEventListener("deleteTask", this.onDeleteTask.bind(this));

        this.m_configService = frameworkService.getService("ConfigService");
        this.m_apiServerConfig = await this.m_configService.getGlobalConfig("apiServer");
        this.m_utilService = frameworkService.getService("UtilService");
    }

    async loadTradeTask(ltcAry) {
        for (let idx = 0; idx < ltcAry.length; ++idx) {
            let obj = ltcAry[idx];
            this.m_ltcCheckOTAAry.push(obj);
        }
    }

    async start() {
        let checkLtcTxServiceCfg = await this.m_configService.getGlobalConfig("CheckLtcTxService");
        console.log("checkLtcTxServiceCfg:", checkLtcTxServiceCfg);
        this.m_taskService.addTask(this, checkLtcTxServiceCfg.queryActionInfoInterval, "");
    }

    async addOTAInfo(obj) {
        //{
        //    ccTaskId: 1612254034475,
        //    chainAddr: "0xeb195290a199f78d184b02bbf71fa6460371fcfc",
        //    chainType: "ETH",
        //    fromBlockNumber: 8001718,
        //    oneTimeAddr: "2Mxafcik8cDyZjnKbGHeeDQgQT69ZjjiNHs",
        //    randomId: "0xe5796e22fb67555f18f1383017450dd9eb54b49491046899d7ef0acfdc24716b",
        //    smgId: "0x000000000000000000000000000000000000000000746573746e65745f303139",
        //    smgPublicKey: "0x22d052cc97bf5eb3932ac5d7123967140d31c48d90de5272eecdf1ae0799bf180fbae2a72a9ec7af25d29548dcc5dd2cad637fcd2df0e21c1a15f206296c0c20"
        //};
        //console.log("CheckLtcTxService addOTAInfo obj:", obj);
        let tmpObj = {
            "ccTaskId": obj.ccTaskId,
            "oneTimeAddr": obj.oneTimeAddr,
            "chain": obj.chainType,
            "fromBlockNumber": obj.fromBlockNumber,
            "taskType": "MINT"
        };
        let storageService = this.m_frameworkService.getService("StorageService");
        await storageService.save("CheckLtcTxService", obj.ccTaskId, tmpObj);
        this.m_ltcCheckOTAAry.unshift(tmpObj);
    }

    async runTask(taskPara) {
        let storageService = this.m_frameworkService.getService("StorageService");
        let url = this.m_apiServerConfig.url + "/api/ltc/queryActionInfo/";
        let count = this.m_ltcCheckOTAAry.length;
        for (let idx = 0; idx < count; ++idx) {
            let index = count - idx - 1;
            let obj = this.m_ltcCheckOTAAry[index];

            try {
                let queryUrl = url + obj.oneTimeAddr;
                // console.log("CheckLtcTxService queryUrl:", queryUrl);
                let ret = await axios.get(queryUrl);
                if (ret.data.success === true && ret.data.data !== null) {
                    let txhash = ret.data.data.ltcHash;
                    let sender = await this.m_utilService.getBtcTxSender("LTC", txhash);
                    let eventService = this.m_frameworkService.getService("EventService");
                    await eventService.emitEvent("LockTxHash",
                        {
                            ccTaskId: obj.ccTaskId,
                            txhash,
                            sentAmount: ret.data.data.value,
                            sender
                        });
                    obj.uniqueID = "0x" + txhash;
                    let scEventScanService = this.m_frameworkService.getService("ScEventScanService");
                    await scEventScanService.add(obj);
                    await this.m_eventService.emitEvent("crossChainTaskSubmitted", obj.ccTaskId);
                    await storageService.delete("CheckLtcTxService", obj.ccTaskId);
                    this.m_ltcCheckOTAAry.splice(index, 1);
                }
            }
            catch (err) {
                console.log("CheckLtcTxService runTask err:", err);
            }
        }
    }

    async onDeleteTask(ccTaskId) {
        try {
            for (let idx = 0; idx < this.m_ltcCheckOTAAry.length; ++idx) {
                let obj = this.m_ltcCheckOTAAry[idx];
                if (obj.ccTaskId === ccTaskId) {
                    this.m_ltcCheckOTAAry.splice(idx, 1);
                    let storageService = this.m_frameworkService.getService("StorageService");
                    await storageService.delete("ScEventScanService", obj.ccTaskId);
                    break;
                }
            }
        }
        catch (err) {
            console.log("CheckLtcTxService onDeleteTask err:", err);
        }
    }
}

