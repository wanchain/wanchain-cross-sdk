'use strict';

const ProcessBase = require("./processBase.js");

module.exports = class ProcessErc721Approve extends ProcessBase{
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
            let scData = await txGeneratorService.generatorErc721ApproveData(params.tokenAddr, params.operator, params.value);
            let txData = await txGeneratorService.generateTx(params.scChainType, params.gasPrice, params.gasLimit, params.tokenAddr, 0, scData, params.fromAddr);
            await this.sendTransactionData(paramsJson, txData, wallet);
        } catch (err) {
            console.error("ProcessErc721Approve error: %O", err);
            this.m_WebStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, paramsJson.stepIndex, "", strFailed, "Failed to approve ERC721 token");
        }
    }
};