'use strict';

const tool = require("../../utils/tool.js");
let ProcessBase = require("./processBase.js");

module.exports = class ProcessErc20Approve extends ProcessBase{
    constructor(frameworkService) {
        super(frameworkService);
    }

    async process(stepData, wallet) {
        let strFailed = this.m_uiStrService.getStrByName("Failed");
        let params = stepData.params;
        try {
            if (!(await this.checkChainId(stepData, wallet))) {
                return;
            }
            let txData, options = {chainType: params.scChainType, from: params.fromAddr};
            if (wallet.generatorErc20ApproveData) { // wallet custumized
              txData = await wallet.generatorErc20ApproveData(params.erc20Addr, params.spenderAddr, params.value, options);
            } else {
              let scData = await this.m_txGeneratorService.generatorErc20ApproveData(params.erc20Addr, params.spenderAddr, params.value, options);
              txData = await this.m_txGeneratorService.generateTx(params.scChainType, scData.gasLimit, params.erc20Addr, 0, scData.data, params.fromAddr);
            }
            await this.sendTransactionData(stepData, txData, wallet);
        } catch (err) {
            console.error("ProcessErc20Approve error: %O", err);
            this.m_WebStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", strFailed, "Failed to approve token");
        }
    }

    async getConvertInfoForCheck(stepData) {
      let params = stepData.params;
      let txEventTopics = [
          "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925",       // Approval
          "0x" + tool.hexStrip0x(params.fromAddr).toLowerCase().padStart(64, '0'),    // onwer
          "0x" + tool.hexStrip0x(params.spenderAddr).toLowerCase().padStart(64, '0')  // spender
      ];
      return {txEventTopics, convertCheckInfo: null};
    }
};