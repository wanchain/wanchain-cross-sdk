'use strict';

const axios = require("axios");
const tool = require("../../utils/tool.js");
const bitcoin = require('bitcoinjs-lib');

module.exports = class CheckBtcTxService {
    constructor(chainType = "BTC") {
        this.chainType = chainType;
        this.serviceName = "Check" + this.chainType.charAt(0).toUpperCase() + this.chainType.substr(1).toLowerCase() + "TxService";
        this.checkOtas = [];
    }

    async init(frameworkService) {
        this.m_frameworkService = frameworkService;
        this.m_taskService = frameworkService.getService("TaskService");
        this.m_eventService = frameworkService.getService("EventService");
        this.m_eventService.addEventListener("deleteTask", this.onDeleteTask.bind(this));

        this.m_configService = frameworkService.getService("ConfigService");
        this.m_apiServerConfig = await this.m_configService.getGlobalConfig("apiServer");
        this.m_utilService = frameworkService.getService("UtilService");

        this.lockTxTimeout = await this.m_configService.getGlobalConfig("LockTxTimeout");
    }

    async loadTradeTask(otas) {
        otas.map(ota => this.checkOtas.push(ota));
    }

    async start() {
        let cfg = await this.m_configService.getGlobalConfig(this.serviceName);
        // console.debug("%s cfg: %O", this.serviceName, cfg);
        this.m_taskService.addTask(this, cfg.queryActionInfoInterval, "");
    }

    async addOTAInfo(obj) {
        let tmpObj = {
            "ccTaskId": obj.ccTaskId,
            "oneTimeAddr": obj.oneTimeAddr,
            "chain": obj.chainType,
            "fromBlockNumber": obj.fromBlockNumber,
            "taskType": "MINT"
        };
        let storageService = this.m_frameworkService.getService("StorageService");
        await storageService.save(this.serviceName, obj.ccTaskId, tmpObj);
        this.checkOtas.unshift(tmpObj);
    }

    getOtaTxUniqueId(txHash, address) {
      txHash = "0x" + tool.hexStrip0x(txHash);
      let hash160 = "0x" + bitcoin.address.fromBase58Check(address).hash.toString('hex');
      let uniqueId = tool.sha256(txHash + hash160);
      // console.log({txHash, hash160, uniqueId});
      return uniqueId;
    }

    async runTask(taskPara) {
        let storageService = this.m_frameworkService.getService("StorageService");
        let url = this.m_apiServerConfig.url + "/api/" + this.chainType.toLowerCase() + "/queryActionInfo/";
        let count = this.checkOtas.length;
        for (let idx = 0; idx < count; ++idx) {
            let index = count - idx - 1;
            let obj = this.checkOtas[index];

            try {
                let queryUrl = url + obj.oneTimeAddr;
                console.debug("%s queryUrl: %s", this.serviceName, queryUrl);
                let ret = await axios.get(queryUrl);
                if (ret.data.success === true && ret.data.data !== null) {
                    let txHashField = this.chainType.toLowerCase() + "Hash";
                    let txHash = ret.data.data[txHashField];
                    let sender = await this.m_utilService.getBtcTxSender(this.chainType, txHash);
                    obj.uniqueID = this.getOtaTxUniqueId(txHash, obj.oneTimeAddr);
                    await this.m_eventService.emitEvent("LockTxHash", {
                        ccTaskId: obj.ccTaskId,
                        txHash,
                        sentAmount: ret.data.data.value,
                        sender,
                        uniqueId: obj.uniqueID
                    });
                    let scEventScanService = this.m_frameworkService.getService("ScEventScanService");
                    await scEventScanService.add(obj);
                    await storageService.delete(this.serviceName, obj.ccTaskId);
                    this.checkOtas.splice(index, 1);
                } else if (tool.checkTimeout(obj.ccTaskId, this.lockTxTimeout)) {
                    console.debug("task %s wait lock tx timeout", obj.ccTaskId);
                    await this.m_eventService.emitEvent("LockTxTimeout", {
                        ccTaskId: obj.ccTaskId
                    });
                    // DO NOT delete from storage, can be resumed by refreshing page
                    this.checkOtas.splice(index, 1);
                }
            }
            catch (err) {
                console.error("%s runTask err: %O", this.serviceName, err);
            }
        }
    }

    async onDeleteTask(ccTaskId) {
        try {
            for (let idx = 0; idx < this.checkOtas.length; ++idx) {
                let obj = this.checkOtas[idx];
                if (obj.ccTaskId === ccTaskId) {
                    this.checkOtas.splice(idx, 1);
                    let storageService = this.m_frameworkService.getService("StorageService");
                    await storageService.delete(this.serviceName, obj.ccTaskId);
                    break;
                }
            }
        }
        catch (err) {
            console.log("%s onDeleteTask err: %O", this.serviceName, err);
        }
    }
}

