'use strict';

const ProcessBase = require("./processBase.js");

module.exports = class ProcessErc721Approve extends ProcessBase{
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
            let txGeneratorService = this.m_frameworkService.getService("TxGeneratorService");
            let options = {chainType: params.scChainType, from: params.fromAddr};
            let scData = await txGeneratorService.generatorErc721ApproveData(params.tokenAddr, params.operator, options);
            let txData = await txGeneratorService.generateTx(params.scChainType, scData.gasLimit, params.tokenAddr, 0, scData.data, params.fromAddr);
            await this.sendTransactionData(stepData, txData, wallet);
        } catch (err) {
            console.error("ProcessErc721Approve error: %O", err);
            this.m_WebStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", strFailed, "Failed to approve ERC721 token");
        }
    }
};