'use strict';

module.exports = class TaskService{
    constructor() {
        this.m_aryTaskInfo = [];
        this.m_lastRunTime = new Date().getTime();
    }

    async init(frameworkService) {
        let configService = frameworkService.getService("ConfigService");
        let taskInterval = configService.getConfig("TaskService", "taskInterval");
        this.m_taskInterval = taskInterval;
        setTimeout(() => { this.taskLoop(); }, 0);
    }

    async addTask(taskInst, taskInterval, taskPara = "") {
        for (let idx = 0; idx < this.m_aryTaskInfo.length; ++idx) {
            if (taskInst === this.m_aryTaskInfo[idx].taskInst) {
                return;
            }
        }
        let obj = {
            taskInst: taskInst,
            taskInterval: taskInterval,
            taskPara: taskPara,
            lastRunTime: 0
        };
        this.m_aryTaskInfo.push(obj);
    }

    async removeTask(taskInst) {
        let tmp = [];
        for (let idx = 0; idx < this.m_aryTaskInfo.length; ++idx) {
            let obj = this.m_aryTaskInfo[idx];
            if (taskInst === obj.taskInst) {
                continue;
            }
            tmp.push(obj);
        }
        this.m_aryTaskInfo = tmp;
    }

    async taskLoop() {
        try {
            let now = new Date().getTime();
            for (let idx = 0; idx < this.m_aryTaskInfo.length; ++idx) {
                let obj = this.m_aryTaskInfo[idx];
                try {// 避免因为一个task出错导致所有task无法执行
                    if ((now - obj.lastRunTime) >= obj.taskInterval) {
                        await obj.taskInst.runTask(obj.taskPara);
                        obj.lastRunTime = now;
                    }
                }
                catch (err) {
                    console.log("taskLoop err:", err);
                }
            }
            setTimeout(() => { this.taskLoop(); }, this.m_taskInterval);
        }
        catch (err) {
            setTimeout(() => { this.taskLoop(); }, this.m_taskInterval);
        }
    }
}