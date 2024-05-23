"use strict";

const tool = require('../../utils/tool.js');
const taskTypeConfig = require("../../config/taskTypeConfig/taskTypeConfig.js");

module.exports = class TxTaskHandleService {
    constructor() {
        this.m_mapTaskTypeToHandler = new Map(); // taskType => Handler
    }

    async init(frameworkService) {
        try {
            this.m_frameworkService = frameworkService;

            for (let idx = 0; idx < taskTypeConfig.length; ++idx) {
                let obj = taskTypeConfig[idx];
                this.m_mapTaskTypeToHandler.set(obj.name, obj.handle);
            }
        }
        catch (err) {
            console.log("TxTaskHandleService init err:", err);
        }
    }

    async processTxTask(taskParas, wallet) {
        let taskType = taskParas.params.taskType;
        try {
            let TxTaskHandler = this.m_mapTaskTypeToHandler.get(taskType);
            let txHandler = new TxTaskHandler(this.m_frameworkService);
            let result = await txHandler.process(taskParas, wallet);
            return result;
        } catch (err) {
            console.error("TxTaskHandleService processTxTask %s error: %O", taskType, err);
            let errMsg = tool.getErrMsg(err, "processTxTask failed");
            return errMsg;
        }
    }
};



