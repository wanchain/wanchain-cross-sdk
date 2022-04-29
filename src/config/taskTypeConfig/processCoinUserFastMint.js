'use strict';

const BigNumber = require("bignumber.js");
const ProcessBase = require("./processBase.js");

module.exports = class ProcessCoinUserFastMint extends ProcessBase {
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
            let txData, netValue = new BigNumber(params.value).minus(params.fee);
            if (wallet.generateUserLockTx) { // wallet custumized
              txData = await wallet.generateUserLockTx(params.crossScAddr,
                params.storemanGroupId,
                params.tokenPairID,
                netValue,
                params.userAccount,
                params.fee)
            } else { // common evm
              let txGeneratorService = this.m_frameworkService.getService("TxGeneratorService");
              let scData = await txGeneratorService.generateUserLockData(params.crossScAddr,
                  params.storemanGroupId,
                  params.tokenPairID,
                  netValue,
                  params.userAccount);
              txData = await txGeneratorService.generateTx(params.scChainType, params.gasPrice, params.gasLimit, params.crossScAddr.toLowerCase(), params.value, scData, params.fromAddr);
            }
            await this.sendTransactionData(stepData, txData, wallet);
        } catch (err) {
            console.error("ProcessCoinUserFastMint error: %O", err);
            this.m_WebStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", strFailed, "Failed to send transaction");
        }
    }

    // virtual function
    async getConvertInfoForCheck(stepData) {
        let storemanService = this.m_frameworkService.getService("StoremanService");
        let params = stepData.params;
        let tokenPairObj = await storemanService.getTokenPairObjById(params.tokenPairID);
        let blockNumber = await this.m_iwanBCConnector.getBlockNumber(tokenPairObj.toChainType);
        let obj = {
            needCheck: true,
            checkInfo: {
                ccTaskId: params.ccTaskId,
                uniqueID: stepData.txHash,
                userAccount: params.userAccount,
                smgID: params.storemanGroupId,
                tokenPairID: params.tokenPairID,
                value: new BigNumber(params.value).minus(params.fee),
                chain: tokenPairObj.toChainType,
                fromBlockNumber: blockNumber,
                taskType: "MINT"
            }
        };
        return obj;
    }
};