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
            let txData, crossValue = new BigNumber(params.value).minus(params.networkFee);
            if (wallet.generateUserLockData) { // wallet custumized
              txData = await wallet.generateUserLockData(params.crossScAddr,
                params.storemanGroupId,
                params.tokenPairID,
                crossValue,
                params.userAccount,
                {coinValue: params.value});
            } else { // common evm
              let txGeneratorService = this.m_frameworkService.getService("TxGeneratorService");
              let scData = await txGeneratorService.generateUserLockData(params.crossScAddr,
                  params.storemanGroupId,
                  params.tokenPairID,
                  crossValue,
                  params.userAccount,
                  {tokenType: "Erc20"});
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
        let tokenPairService = this.m_frameworkService.getService("TokenPairService");
        let params = stepData.params;
        let tokenPair = tokenPairService.getTokenPair(params.tokenPairID);
        let direction = (params.scChainType === tokenPair.fromChainType)? "MINT" : "BURN";
        let checkChainType = (direction === "MINT")? tokenPair.toChainType : tokenPair.fromChainType;
        let taskType = tokenPairService.getTokenEventType(params.tokenPairID, direction);
        let blockNumber = await this.m_iwanBCConnector.getBlockNumber(checkChainType);
        let obj = {
            needCheck: true,
            checkInfo: {
                ccTaskId: params.ccTaskId,
                uniqueID: stepData.txHash,
                userAccount: params.userAccount,
                smgID: params.storemanGroupId,
                tokenPairID: params.tokenPairID,
                value: new BigNumber(params.value).minus(params.fee),
                chain: checkChainType,
                fromBlockNumber: blockNumber,
                taskType
            }
        };
        return obj;
    }
};