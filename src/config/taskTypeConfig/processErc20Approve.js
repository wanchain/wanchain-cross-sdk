'use strict';
let BigNumber = require("bignumber.js");

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

            if (typeof params.value === "string") {
                params.value = new BigNumber(params.value);
            }
            if (params.value.isGreaterThan(0)) {
                let allowance = await this.m_iwanBCConnector.getErc20Allowance(params.scChainType, params.erc20Addr, params.fromAddr, params.spenderAddr, params.erc20Abi);
                console.log("ProcessErc20Approve allowance:", allowance);
                if (allowance > 0) {
                    this.m_WebStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, paramsJson.stepIndex, "", strFailed, "Repeated approval of erc20 tokens");
                    return;
                }
            }

            let txGeneratorService = this.m_frameworkService.getService("TxGeneratorService");
            let scData = await txGeneratorService.generatorErc20ApproveData(params.erc20Addr, params.erc20Abi, params.spenderAddr, params.value);
            let txData = await txGeneratorService.generateTx(params.scChainType, params.gasPrice, params.gasLimit, params.erc20Addr, 0, scData, params.fromAddr);

            await this.sendTransactionData(paramsJson, txData, wallet);
            return;
        } catch (err) {
            console.error("ProcessErc20Approve process err: %O", err);
            this.m_WebStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, paramsJson.stepIndex, "", strFailed, "Failed to approve ERC20 token");
        }
    }
};