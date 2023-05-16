'use strict';

let ProcessBase = require("./processBase.js");
const tool = require("../../utils/tool.js");

module.exports = class ProcessErc20Approve extends ProcessBase{
    constructor(frameworkService) {
        super(frameworkService);
    }

    async process(stepData, wallet) {
        let uiStrService = this.m_frameworkService.getService("UIStrService");
        let strFailed = uiStrService.getStrByName("Failed");
        let params = stepData.params;
        try {
            if (!(await this.checkChainId(stepData, wallet))) {
                return;
            }
            let txData, options = {chainType: params.scChainType, from: params.fromAddr};
            if (wallet.generatorErc20ApproveData) { // wallet custumized
              txData = await wallet.generatorErc20ApproveData(params.erc20Addr, params.spenderAddr, params.value, options);
            } else {
              let txGeneratorService = this.m_frameworkService.getService("TxGeneratorService");
              let scData = await txGeneratorService.generatorErc20ApproveData(params.erc20Addr, params.spenderAddr, params.value, options);
              txData = await txGeneratorService.generateTx(params.scChainType, scData.gasLimit, params.erc20Addr, 0, scData.data, params.fromAddr);
            }
            await this.sendTransactionData(stepData, txData, wallet);
        } catch (err) {
            console.error("ProcessErc20Approve error: %O", err);
            this.m_WebStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", strFailed, "Failed to approve token");
        }
    }
};