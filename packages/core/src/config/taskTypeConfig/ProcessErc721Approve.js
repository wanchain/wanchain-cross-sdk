'use strict';

const tool = require("../../utils/tool.js");
const ProcessBase = require("./processBase.js");

module.exports = class ProcessErc721Approve extends ProcessBase{
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
            let options = {chainType: params.scChainType, from: params.fromAddr};
            let scData = await this.m_txGeneratorService.generatorErc721ApproveData(params.tokenAddr, params.operator, options);
            let txData = await this.m_txGeneratorService.generateTx(params.scChainType, scData.gasLimit, params.tokenAddr, 0, scData.data, params.fromAddr);
            await this.sendTransactionData(stepData, txData, wallet);
        } catch (err) {
            console.error("ProcessErc721Approve error: %O", err);
            this.m_WebStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", strFailed, "Failed to approve ERC721 token");
        }
    }

    async getConvertInfoForCheck(stepData) {
      let params = stepData.params;
      let txEventTopics = [
          "0x17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b5937696c31",     // ApprovalForAll
          "0x" + tool.hexStrip0x(params.fromAddr).toLowerCase().padStart(64, '0'),  // account
          "0x" + tool.hexStrip0x(params.operator).toLowerCase().padStart(64, '0')   // operator
      ];
      return {txEventTopics, convertCheckInfo: null};
    }
};