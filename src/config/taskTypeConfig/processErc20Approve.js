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
                    this.m_WebStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, paramsJson.stepIndex, "", strFailed);
                    return;
                }
            }

            let txGeneratorService = this.m_frameworkService.getService("TxGeneratorService");
            // async generatorErc20ApproveData(ecr20Address, erc20AbiJson, spenderAddress, value)
            let scData = await txGeneratorService.generatorErc20ApproveData(params.erc20Addr, params.erc20Abi, params.spenderAddr, params.value);
            let txData = await txGeneratorService.generateTx(params.scChainType, params.gasPrice, params.gasLimit, params.erc20Addr, 0, scData, params.fromAddr);

            await this.sendTransactionData(paramsJson, txData, wallet);
            return;
        }
        catch (err) {
            console.log("ProcessErc20Approve process err:", err);
            this.m_WebStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, paramsJson.stepIndex, err.message, strFailed);
        }
    }
};

// { "name": "erc20Approve", "stepIndex": retAry.length + 1, "title": "erc20Approve title", "desc": "erc20Approve desc", "params": erc20ApproveParaJson }
//let erc20ApproveParaJson = {
//    "ccTaskId": ccTaskId
//    "fromAddr": convertJson.fromAddr,
//    "scChainType": mintChainInfo.chaintype,
//    "erc20Addr": tokenPairObj.fromAccount,
//    "erc20Abi": mintChainScInfo.erc20AbiJson,
//    "value": convertJson.value,
//    "spenderAddr": mintChainScInfo.crossScAddr,
//    "processHandler": new ProcessErc20Approve()
//};