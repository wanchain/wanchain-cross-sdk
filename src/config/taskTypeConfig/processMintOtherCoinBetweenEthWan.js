'use strict';

const ProcessBase = require("./processBase.js");

module.exports = class ProcessMintOtherCoinBetweenEthWan extends ProcessBase {
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
            let txGeneratorService = this.m_frameworkService.getService("TxGeneratorService");
            let scData = await txGeneratorService.generateUserBurnData(params.crossScAddr,
                params.storemanGroupId,
                params.tokenPairID,
                params.value,
                params.userBurnFee,
                params.tokenAccount,
                params.userAccount);

            // async generateTx(toAddress, value, txData)
            let txValue = params.fee;
            let txData = await txGeneratorService.generateTx(params.scChainType, params.gasPrice, params.gasLimit, params.crossScAddr, txValue, scData, params.fromAddr);
            await this.sendTransactionData(stepData, txData, wallet);
            return;
        } catch (err) {
            console.error("ProcessErc20UserFastMint error: %O", err);
            this.m_WebStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", strFailed, "Failed to send transaction");
        }
    }

    // virtual function
    async getConvertInfoForCheck(stepData) {
        let params = stepData.params;
        let storemanService = this.m_frameworkService.getService("StoremanService");
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
                value: params.value,
                chain: tokenPairObj.toChainType,
                fromBlockNumber: blockNumber,
                taskType: "MINT"
            }
        };
        return obj;
    }
};