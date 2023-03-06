"use strict";
let taskTypeConfig = require("../../config/taskTypeConfig/taskTypeConfig.js");

module.exports = class TxTaskHandleService {
    constructor() {
        this.m_mapTaskTypeToHandler = new Map(); // taskType => Handler
    }

    async init(frameworkService) {
        try {
            this.m_frameworkService = frameworkService;

            for (let idx = 0; idx < taskTypeConfig.taskTypeCfg.length; ++idx) {
                let obj = taskTypeConfig.taskTypeCfg[idx];
                this.m_mapTaskTypeToHandler.set(obj.name, obj.handle);
            }
        }
        catch (err) {
            console.log("TxTaskHandleService init err:", err);
        }
    }

    async processTxTask(taskParas, wallet) {
        try {
            let params = taskParas.params;
            let TxTaskHandler = this.m_mapTaskTypeToHandler.get(params.taskType);
            let txHandler = new TxTaskHandler(this.m_frameworkService);
            await txHandler.process(taskParas, wallet);
        }
        catch (err) {
            console.log("TxTaskHandleService processTxTask err:", err);
        }
    }
};



