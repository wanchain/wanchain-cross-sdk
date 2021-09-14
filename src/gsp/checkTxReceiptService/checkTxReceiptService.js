'use strict';

module.exports = class CheckTxReceiptService {
    constructor() {
        this.m_tradeTaskAry = [];
    }

    async init(frameworkService) {
        this.m_frameworkService = frameworkService;
        this.m_iwanBCConnector = frameworkService.getService("iWanConnectorService");
        this.m_taskService = frameworkService.getService("TaskService");
        this.m_WebStores = frameworkService.getService("WebStores");
        this.m_eventService = frameworkService.getService("EventService");
        this.m_eventService.addEventListener("deleteTask", this.onDeleteTask.bind(this));
    }

    async onDeleteTask(ccTaskId) {
        try {
            for (let idx = 0; idx < this.m_tradeTaskAry.length; ++idx) {
                let obj = this.m_tradeTaskAry[idx];
                if (obj.ccTaskId === ccTaskId) {
                    this.m_tradeTaskAry.splice(idx, 1);
                    let storageService = this.m_frameworkService.getService("StorageService");
                    storageService.delete("ScEventScanService", obj.ccTaskId);
                    break;
                }
            }
        }
        catch (err) {
            console.log("CheckTxReceiptService onDeleteTask err:", err);
        }
    }

    async loadTradeTask(tradeTaskAry) {
        this.m_tradeTaskAry = tradeTaskAry;
    }

    async start() {
        this.m_taskService.addTask(this, 1000, "");
    }

    async runTask(taskPara) {
        let connected = await this.m_iwanBCConnector.isConnected();
        if (connected === false) {
            //console.log("CheckTxReceiptService runTask iwan no connect");
            return;
        }

        let storageService = this.m_frameworkService.getService("StorageService");
        let length = this.m_tradeTaskAry.length;
        for (let idx = 0; idx < length; ++idx) {
            let index = length - idx - 1;
            let obj = this.m_tradeTaskAry[index];
            try {
                let txReceipt = await this.m_iwanBCConnector.getTransactionReceipt(obj.chain, obj.txhash);
                if (txReceipt) {
                    let result = "Failed";
                    let errInfo = "Transaction failed";
                    if (txReceipt.status === "0x1" || txReceipt.status === true) {// 旧版0x0/0x1,1.2.6版true/false
                        result = "Succeeded";
                        errInfo = "";
                        await this.addToScEventScan(obj);
                    }
                    this.m_WebStores["crossChainTaskSteps"].finishTaskStep(obj.ccTaskId, obj.stepIndex, obj.txhash, result, errInfo);
                    await storageService.delete("CheckTxReceiptService", obj.ccTaskId);
                    this.m_tradeTaskAry.splice(index, 1);
                } else {
                    //let tx = await this.m_iwanBCConnector.getTxInfo(obj.chain, obj.txhash);
                    //if (tx) {
                    //    continue;// 仍在队列中
                    //}
                    //else {
                    //    //let 
                    //    //this.m_iwanBCConnector = this.m_frameworkService.getService("iWanConnectorService");
                    //}
                    continue;
                }
            }
            catch (err) {
                continue;
            }
        }
    }

    async addToScEventScan(obj) {
        if (obj.convertCheckInfo) {
            if (obj.convertCheckInfo.needCheck) {
                let scEventScanService = this.m_frameworkService.getService("ScEventScanService");
                await scEventScanService.add(obj.convertCheckInfo.checkInfo);
            }
        }
    }

    async add(obj) {
        //let obj = {
        //    "chain": params.scChainType,
        //    "ccTaskId": params.ccTaskId,
        //    "stepIndex": paramsJson.stepIndex,
        //    "txhash": ret.txhash,
        //    "convertCheckInfo": convertCheckInfo
        //};
        obj.sendTime = new Date().getTime();
        let storageService = this.m_frameworkService.getService("StorageService");
        await storageService.save("CheckTxReceiptService", obj.ccTaskId, obj);
        this.m_tradeTaskAry.push(obj);
    }
};

