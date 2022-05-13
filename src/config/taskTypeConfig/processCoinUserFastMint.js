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
            let storemanService = this.m_frameworkService.getService("StoremanService");
            let tokenPair = await storemanService.getTokenPair(params.tokenPairID);
            let userAccount = tool.getStandardAddressInfo(tokenPair.toChainType, params.userAccount).standard;
            let txData, crossValue = new BigNumber(params.value).minus(params.fee);
            if (wallet.generateUserLockData) { // wallet custumized
              txData = await wallet.generateUserLockData(params.crossScAddr,
                params.storemanGroupId,
                params.tokenPairID,
                crossValue,
                userAccount,
                params.value);
            } else { // common evm
              let txGeneratorService = this.m_frameworkService.getService("TxGeneratorService");
              let scData = await txGeneratorService.generateUserLockData(params.crossScAddr,
                  params.storemanGroupId,
                  params.tokenPairID,
                  crossValue,
                  userAccount);
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
        let tokenPair = await storemanService.getTokenPair(params.tokenPairID);
        let blockNumber = await this.m_iwanBCConnector.getBlockNumber(tokenPair.toChainType);
        let userAccount = tool.getStandardAddressInfo(tokenPair.toChainType, params.userAccount).standard;
        let obj = {
            needCheck: true,
            checkInfo: {
                ccTaskId: params.ccTaskId,
                uniqueID: stepData.txHash,
                userAccount,
                smgID: params.storemanGroupId,
                tokenPairID: params.tokenPairID,
                value: new BigNumber(params.value).minus(params.fee),
                chain: tokenPair.toChainType,
                fromBlockNumber: blockNumber,
                taskType: "MINT"
            }
        };
        return obj;
    }
};