'use strict';
const axios = require("axios");
// let BigNumber = require("bignumber.js");
module.exports = class CheckDotTxService {
    constructor() {
        this.m_dotCheckAry = [];
    }

    async init(frameworkService) {
        this.m_frameworkService = frameworkService;
        this.m_taskService = frameworkService.getService("TaskService");
        this.m_WebStores = frameworkService.getService("WebStores");
        this.m_eventService = frameworkService.getService("EventService");
        this.m_eventService.addEventListener("deleteTask", this.onDeleteTask.bind(this));
    }

    async loadTradeTask(dotAry) {
        for (let idx = 0; idx < dotAry.length; ++idx) {
            let obj = dotAry[idx];
            this.m_dotCheckAry.push(obj);
        }
    }

    async start() {
        let configService = this.m_frameworkService.getService("ConfigService");
        let apiServerConfig = await configService.getGlobalConfig("apiServer");
        this.m_apiServerUrl = apiServerConfig.url;

        let chainInfoService = this.m_frameworkService.getService("ChainInfoService");
        let dotChainInfo = await chainInfoService.getChainInfoByType("DOT");

        //console.log("dotChainInfo.taskInterval:", dotChainInfo.TxScanInfo.taskInterval);
        this.m_taskService.addTask(this, dotChainInfo.TxScanInfo.taskInterval, "");
    }

    async addDotInfo(obj) {
        //let checkPara = {
        //    ccTaskId: params.ccTaskId,
        //    fromBlockNumber: blockNumber,
        //    txHash: txHash,
        //    chain: params.toChainType,
        //    smgPublicKey: params.storemanGroupGpk
        //};
        let storageService = this.m_frameworkService.getService("StorageService");
        await storageService.save("CheckDotTxService", obj.ccTaskId, obj);
        this.m_dotCheckAry.unshift(obj);
        //console.log("addDotInfo obj:", obj, "m_dotCheckAry:", this.m_dotCheckAry);
    }

    async runTask(taskPara) {
        try {
            // console.log("this.m_dotCheckAry:", this.m_dotCheckAry);
            let storageService = this.m_frameworkService.getService("StorageService");
            let count = this.m_dotCheckAry.length;
            let url = this.m_apiServerUrl + "/api/dot/queryTxInfoBySmgPbkHash/";
            for (let idx = 0; idx < count; ++idx) {
                let index = count - idx - 1;
                let obj = this.m_dotCheckAry[index];
                try {
                    let queryUrl = url + obj.smgPublicKey + "/" + obj.txHash;
                    // console.log("CheckDotTxService queryUrl:", queryUrl);
                    let ret = await axios.get(queryUrl);
                    //console.log("CheckDotTxService ret:", ret.data);
                    if (ret.data.success === true && ret.data.data !== null) {
                      // console.log("ret.data:", ret.data);
                      obj.uniqueID = ret.data.data.hashX;
                      // let eventService = this.m_frameworkService.getService("EventService");

                      // let chainInfoService = this.m_frameworkService.getService("ChainInfoService");
                      // let chainInfo = await chainInfoService.getChainInfoByType("DOT");
                      // let pows = new BigNumber(Math.pow(10, chainInfo.chainDecimals));
                      // let sentAmount = new BigNumber(ret.data.data.value);
                      // sentAmount = sentAmount.div(pows);
                      // let tmpObj = {
                      //   "ccTaskId": obj.ccTaskId,
                      //   "txhash": ret.data.data.txHash,
                      //   "sentAmount": sentAmount.toFixed()
                      // };
                      // console.log("dot tmpObj:", tmpObj);
                      // await eventService.emitEvent("LockTxHash", tmpObj);
                      this.m_WebStores["crossChainTaskSteps"].finishTaskStep(obj.ccTaskId, obj.stepIndex, obj.txHash, "Succeeded");
                      let scEventScanService = this.m_frameworkService.getService("ScEventScanService");
                      await scEventScanService.add(obj);
                      await storageService.delete("CheckDotTxService", obj.ccTaskId);
                      this.m_dotCheckAry.splice(index, 1);
                    }
                }
                catch (err) {
                    console.log("CheckDotTxService runTask err:", err);
                }
            }
        }
        catch (err) {
            console.log("CheckDotTxService err:", err);
        }
    }

    async onDeleteTask(ccTaskId) {
        try {
            for (let idx = 0; idx < this.m_dotCheckAry.length; ++idx) {
                let obj = this.m_dotCheckAry[idx];
                if (obj.ccTaskId === ccTaskId) {
                    this.m_dotCheckAry.splice(idx, 1);
                    let storageService = this.m_frameworkService.getService("StorageService");
                    await storageService.delete("CheckDotTxService", obj.ccTaskId);
                    break;
                }
            }
        }
        catch (err) {
            console.log("CheckDotTxService onDeleteTask err:", err);
        }
    }
}

