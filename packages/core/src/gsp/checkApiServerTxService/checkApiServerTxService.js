'use strict';

const axios = require("axios");

module.exports = class CheckApiServerTxService {
    constructor(chainType) {
        this.chainType = chainType;
        this.serviceName = "Check" + chainType.charAt(0).toUpperCase() + chainType.substr(1).toLowerCase() + "TxService";
        this.checkArray = [];
    }

    async init(frameworkService) {
        this.frameworkService = frameworkService;
        this.taskService = frameworkService.getService("TaskService");
        this.webStores = frameworkService.getService("WebStores");
        this.eventService = frameworkService.getService("EventService");
    }

    async loadTradeTask(tasks) {
        tasks.forEach(task => this.checkArray.push(task));
    }

    async start() {
        let configService = this.frameworkService.getService("ConfigService");
        let apiServerConfig = configService.getGlobalConfig("apiServer");
        this.apiServerUrl = apiServerConfig.url;
        let chainInfoService = this.frameworkService.getService("ChainInfoService");
        let chainInfo = chainInfoService.getChainInfoByType(this.chainType);
        this.taskService.addTask(this, chainInfo.TxScanInfo.taskInterval);
    }

    async addTask(task) {
        let storageService = this.frameworkService.getService("StorageService");
        await storageService.save(this.serviceName, task.ccTaskId, task);
        this.checkArray.unshift(task);
        //console.debug("addTask:", task, "checkArray:", this.checkArray);
    }

    async runTask(taskPara) {
        try {
            // console.log("this.checkArray:", this.checkArray);
            let storageService = this.frameworkService.getService("StorageService");
            let count = this.checkArray.length;
            let url = this.apiServerUrl + "/api/" + this.chainType.toLowerCase() + "/queryTxInfoBySmgPbkHash/";
            for (let idx = 0; idx < count; ++idx) {
                let index = count - idx - 1;
                let task = this.checkArray[index];
                try {
                    let queryUrl = url + task.smgPublicKey + "/" + task.txHash;
                    let ret = await axios.get(queryUrl);
                    console.debug("%s %s: %O", this.serviceName, queryUrl, ret.data);
                    if (ret.data.success && ret.data.data) {
                      task.uniqueID = ret.data.data.hashX;
                      task.fromChain = this.chainType;
                      task.chainHash = task.txHash;
                      await this.eventService.emitEvent("TaskStepResult", {
                        ccTaskId: task.ccTaskId,
                        stepIndex: task.stepIndex,
                        txHash: task.txHash,
                        result: "Succeeded"
                      });
                      let scEventScanService = this.frameworkService.getService("ScEventScanService");
                      await scEventScanService.add(task);
                      await storageService.delete(this.serviceName, task.ccTaskId);
                      this.checkArray.splice(index, 1);
                    }
                } catch (err) {
                    console.error("%s runTask error: %O", this.serviceName, err);
                }
            }
        } catch (err) {
            console.error("%s error: %O", this.serviceName, err);
        }
    }
}