'use strict';

let ProcessBase = require("./processBase.js");

module.exports = class ProcessErc20Approve extends ProcessBase{
    constructor(frameworkService) {
        super(frameworkService);
    }

    async process(paramsJson, wallet) {
        let uiStrService = this.m_frameworkService.getService("UIStrService");
        let strFailed = uiStrService.getStrByName("Failed");
        let params = paramsJson.params;
        try {
            if (!(await this.checkChainId(paramsJson, wallet))) {
                return;
            }
            let txGeneratorService = this.m_frameworkService.getService("TxGeneratorService");
            let scData = await txGeneratorService.generatorErc20ApproveData(params.erc20Addr, params.erc20Abi, params.spenderAddr, params.value);
            let txData = await txGeneratorService.generateTx(params.scChainType, params.gasPrice, params.gasLimit, params.erc20Addr, 0, scData, params.fromAddr);
            await this.sendTransactionData(paramsJson, txData, wallet);
        } catch (err) {
            console.error("ProcessErc20Approve error: %O", err);
            this.m_WebStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, paramsJson.stepIndex, "", strFailed, "Failed to approve token");
        }
    }
};