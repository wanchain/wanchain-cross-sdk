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
        this.txGeneratorService = frameworkService.getService("TxGeneratorService");
    }

    async loadTradeTask(tradeTaskAry) {
        this.m_tradeTaskAry = tradeTaskAry;
    }

    async start() {
        this.m_taskService.addTask(this, 3000);
    }

    async runTask(taskPara) {
        let connected = await this.m_iwanBCConnector.isConnected();
        if (connected === false) {
            //console.log("CheckTxReceiptService runTask iwan no connect");
            return;
        }
        let length = this.m_tradeTaskAry.length;
        for (let idx = 0; idx < length; ++idx) {
            let index = length - idx - 1;
            let obj = this.m_tradeTaskAry[index];
            try {
                if (obj.type === "claim") {
                    if (obj.bridge === "Circle") {
                        let scData = await this.txGeneratorService.generateCircleBridgeClaim(obj.chain, obj.from, obj.scAddr, obj.msg, obj.attestation);
                        if (scData === "") { // duplicate
                            await this.finishTask(index, obj, "Succeeded");
                        }
                        continue; // forward compatible
                    }
                }
                let txReceipt = await this.m_iwanBCConnector.getTransactionReceipt(obj.chain, obj.txHash);
                if (txReceipt) {
                    let result = "Failed";
                    let errInfo = "Transaction failed";
                    let isSuccess = false;
                    if (obj.chain === "TRX") {
                      isSuccess = txReceipt.ret && txReceipt.ret[0] && (txReceipt.ret[0].contractRet === "SUCCESS");
                    } else {
                      isSuccess = (txReceipt.status == 1); // 0x0/0x1, true/false
                    }
                    if (isSuccess) {
                        result = "Succeeded";
                        errInfo = "";
                        if (obj.type !== "claim") { // forward compatible for old claim task
                            await this.addToScEventScan(obj);
                        }
                    }
                    await this.finishTask(index, obj, result, errInfo);
                }
            } catch (err) {
                // console.error("%s %s CheckTxReceiptService error: %O", obj.chain, obj.txHash, err);
            }
        }
    }

    async addToScEventScan(obj) {
        if (obj.convertCheckInfo && obj.convertCheckInfo.needCheck) {
            let scEventScanService = this.m_frameworkService.getService("ScEventScanService");
            await scEventScanService.add(obj.convertCheckInfo.checkInfo);
        }
    }

    async add(obj) {
        //let obj = {
        //    "chain": params.scChainType,
        //    "ccTaskId": params.ccTaskId,
        //    "stepIndex": paramsJson.stepIndex,
        //    "txHash": ret.txHash,
        //    "convertCheckInfo": convertCheckInfo
        //};
        obj.sendTime = new Date().getTime();
        let storageService = this.m_frameworkService.getService("StorageService");
        await storageService.save("CheckTxReceiptService", obj.ccTaskId, obj);
        this.m_tradeTaskAry.push(obj);
    }

    async finishTask(index, task, result, errInfo = "") {
        await this.m_eventService.emitEvent("TaskStepResult", {
            ccTaskId: task.ccTaskId,
            stepIndex: task.stepIndex,
            txHash: task.txHash,
            type: task.type,
            bridge: task.bridge,
            result,
            errInfo
        });
        let storageService = this.m_frameworkService.getService("StorageService");
        await storageService.delete("CheckTxReceiptService", task.ccTaskId);
        this.m_tradeTaskAry.splice(index, 1);
    }
};