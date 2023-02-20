"use strict";


module.exports = class TaskInterface {
    constructor() {
        if (new.target === TaskInterface) {
            throw new TypeError("Cannot construct Abstract class directly");
        }
    }

    async runTask(taskPara) {
        throw new Error("Abstract method!");
    }
};