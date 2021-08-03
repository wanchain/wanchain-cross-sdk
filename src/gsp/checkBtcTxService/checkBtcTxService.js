'use strict';

const axios = require("axios");

module.exports = class CheckBtcTxService {
    constructor() {
        this.m_btcCheckOTAAry = [];
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

    async loadTradeTask(btcAry) {
        for (let idx = 0; idx < btcAry.length; ++idx) {
            let obj = btcAry[idx];
            this.m_btcCheckOTAAry.push(obj);
        }
    }

    async start() {
        let checkBtcTxServiceCfg = await this.m_configService.getGlobalConfig("CheckBtcTxService");
        console.log("checkBtcTxServiceCfg:", checkBtcTxServiceCfg);
        this.m_taskService.addTask(this, checkBtcTxServiceCfg.queryActionInfoInterval, "");
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
        //console.log("CheckBtcTxService addOTAInfo obj:", obj);
        let tmpObj = {
            "ccTaskId": obj.ccTaskId,
            "oneTimeAddr": obj.oneTimeAddr,
            "chain": obj.chainType,
            "fromBlockNumber": obj.fromBlockNumber,
            "taskType": "MINT"
        };
        let storageService = this.m_frameworkService.getService("StorageService");
        await storageService.save("CheckBtcTxService", obj.ccTaskId, tmpObj);
        this.m_btcCheckOTAAry.unshift(tmpObj);
    }

    async runTask(taskPara) {
        let storageService = this.m_frameworkService.getService("StorageService");
        let url = this.m_apiServerConfig.url + "/api/btc/queryActionInfo/";
        let count = this.m_btcCheckOTAAry.length;
        for (let idx = 0; idx < count; ++idx) {
            let index = count - idx - 1;
            let obj = this.m_btcCheckOTAAry[index];

            try {
                let queryUrl = url + obj.oneTimeAddr;
                console.log("CheckBtcTxService queryUrl:", queryUrl);
                let ret = await axios.get(queryUrl);
                if (ret.data.success === true && ret.data.data !== null) {
                    let txhash = ret.data.data.btcHash;
                    let sender = await this.m_utilService.getBtcTxSender("BTC", txhash);
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
                    await storageService.delete("CheckBtcTxService", obj.ccTaskId);
                    this.m_btcCheckOTAAry.splice(index, 1);
                }
            }
            catch (err) {
                console.log("CheckBtcTxService runTask err:", err);
            }
        }
    }

    async onDeleteTask(ccTaskId) {
        try {
            for (let idx = 0; idx < this.m_btcCheckOTAAry.length; ++idx) {
                let obj = this.m_btcCheckOTAAry[idx];
                if (obj.ccTaskId === ccTaskId) {
                    this.m_btcCheckOTAAry.splice(idx, 1);
                    let storageService = this.m_frameworkService.getService("StorageService");
                    await storageService.delete("CheckBtcTxService", obj.ccTaskId);
                    break;
                }
            }
        }
        catch (err) {
            console.log("CheckBtcTxService onDeleteTask err:", err);
        }
    }
}

