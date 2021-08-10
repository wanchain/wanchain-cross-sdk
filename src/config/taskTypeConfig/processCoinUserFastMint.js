'use strict';
let BigNumber = require("bignumber.js");
let ProcessBase = require("./processBase.js");

module.exports = class ProcessCoinUserFastMint extends ProcessBase {
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
            // 校验balance
            let balance = await this.m_iwanBCConnector.getBalance(params.scChainType, params.fromAddr);
            let acc_balance = new BigNumber(balance);
            let txValue = params.value.plus(params.fee);
            let totalCost = txValue.plus(params.gasLimit);
            if (acc_balance.isLessThan(totalCost)) {
                this.m_WebStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, paramsJson.stepIndex, "", strFailed);
                return;
            }
            
            let txGeneratorService = this.m_frameworkService.getService("TxGeneratorService");
            let scData = await txGeneratorService.generateUserLockData(params.crossScAddr,
                params.crossScAbi,
                params.storemanGroupId,
                params.tokenPairID,
                params.value,
                params.userAccount);

            let txData;
            txData = await txGeneratorService.generateTx(params.scChainType, params.gasPrice, params.gasLimit, params.crossScAddr.toLowerCase(), txValue, scData, params.fromAddr);
            await this.sendTransactionData(paramsJson, txData, wallet);
            return;
        }
        catch (err) {
            console.log("ProcessCoinUserFastMint process err:", err);
            this.m_WebStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, paramsJson.stepIndex, err.message, strFailed);
        }
    }

    // virtual function
    async getConvertInfoForCheck(paramsJson) {
        let storemanService = this.m_frameworkService.getService("StoremanService");
        let tokenPairObj = await storemanService.getTokenPairObjById(paramsJson.params.tokenPairID);
        let blockNumber = await this.m_iwanBCConnector.getBlockNumber(tokenPairObj.toChainType);
        let obj = {
            needCheck: true,
            checkInfo: {
                "ccTaskId": paramsJson.params.ccTaskId,
                "uniqueID": paramsJson.txhash,
                "userAccount": paramsJson.params.userAccount,
                "smgID": paramsJson.params.storemanGroupId,
                "tokenPairID": paramsJson.params.tokenPairID,
                "value": paramsJson.params.value,
                "chain": tokenPairObj.toChainType,
                "fromBlockNumber": blockNumber,
                "taskType": "MINT"
            }
        };
        return obj;
    }
};


// { "name": "userFastMint", "stepIndex": retAry.length + 1, "title": "userFastMint title", "desc": "userFastMint desc", "params": userFastMintParaJson }
//let userFastMintParaJson = {
//    "fromAddr": convertJson.fromAddr,
//    "scChainType": mintChainInfo.chaintype,
//    "crossScAddr": mintChainScInfo.crossScAddr,
//    "crossScAbi": mintChainScInfo.crossScAbiJson,
//    "storemanGroupId": convertJson.storemanGroupId,
//    "tokenPairID": convertJson.tokenPairId,
//    "value": convertJson.value,
//    "userAccount": convertJson.toAddr,
//    "processHandler": new ProcessUserFastMint(this.m_frameworkService)
//};

