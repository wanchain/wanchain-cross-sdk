'use strict';

const ProcessBase = require("./processBase.js");

module.exports = class ProcessErc20UserFastMint extends ProcessBase {
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
            let txData;
            if (wallet.generateUserLockData) { // wallet custumized
              txData = await wallet.generateUserLockData(params.crossScAddr,
                params.storemanGroupId,
                params.tokenPairID,
                params.value,
                params.userAccount,
                params.fee);              
            } else {
              let txGeneratorService = this.m_frameworkService.getService("TxGeneratorService");
              let scData = await txGeneratorService.generateUserLockData(params.crossScAddr,
                  params.storemanGroupId,
                  params.tokenPairID,
                  params.value,
                  params.userAccount);
              txData = await txGeneratorService.generateTx(params.scChainType, params.gasPrice, params.gasLimit, params.crossScAddr, params.fee, scData, params.fromAddr);
            }
            await this.sendTransactionData(stepData, txData, wallet);
        } catch (err) {
            console.error("ProcessErc20UserFastMint error: %O", err);
            this.m_WebStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", strFailed, "Failed to send transaction");
        }
    }

    // virtual function
    async getConvertInfoForCheck(stepData) {
        let params = stepData.params;
        let storemanService = this.m_frameworkService.getService("StoremanService");
        let tokenPair = await storemanService.getTokenPair(params.tokenPairID);
        let blockNumber = await this.m_iwanBCConnector.getBlockNumber(tokenPair.toChainType);
        let obj = {
            needCheck: true,
            checkInfo: {
                ccTaskId: params.ccTaskId,
                uniqueID: stepData.txHash,
                userAccount: params.userAccount,
                smgID: params.storemanGroupId,
                tokenPairID: params.tokenPairID,
                value: params.value,
                chain: tokenPair.toChainType,
                fromBlockNumber: blockNumber,
                taskType: "MINT"
            }
        };
        return obj;
    }
};