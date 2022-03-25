'use strict';

const ProcessBase = require("./processBase.js");
const tool = require("../../utils/tool.js");

module.exports = class ProcessErc20UserFastBurn extends ProcessBase {
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
            let tokenPair = await storemanService.getTokenPairObjById(params.tokenPairID);
            let userAccount = params.userAccount;
            if (tokenPair.fromChainType === "XDC") {
              userAccount = tool.getXdcAddressInfo(userAccount).eth;
            }
            let txGeneratorService = this.m_frameworkService.getService("TxGeneratorService");
            let scData = await txGeneratorService.generateUserBurnData(params.crossScAddr,
                params.storemanGroupId,
                params.tokenPairID,
                params.value,
                params.userBurnFee,
                params.tokenAccount,
                userAccount);
            let txValue = params.fee;
            let txData = await txGeneratorService.generateTx(params.scChainType, params.gasPrice, params.gasLimit, params.crossScAddr.toLowerCase(), txValue, scData, params.fromAddr.toLowerCase());
            await this.sendTransactionData(stepData, txData, wallet);
        } catch (err) {
            console.error("ProcessUserFastBurn error: %O", err);
            this.m_WebStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", strFailed, "Failed to send transaction");
        }
    }

    // virtual function
    async getConvertInfoForCheck(stepData) {
        let params = stepData.params;
        let storemanService = this.m_frameworkService.getService("StoremanService");
        let tokenPair = await storemanService.getTokenPairObjById(params.tokenPairID);
        let blockNumber = await this.m_iwanBCConnector.getBlockNumber(tokenPair.fromChainType);
        let userAccount = params.userAccount;
        if (tokenPair.fromChainType === "XDC") {
          userAccount = tool.getXdcAddressInfo(userAccount).eth;
        }
        let obj = {
            needCheck: true,
            checkInfo: {
                ccTaskId: params.ccTaskId,
                uniqueID: stepData.txHash,
                userAccount,
                smgID: params.storemanGroupId,
                tokenPairID: params.tokenPairID,
                value: params.value,
                chain: tokenPair.fromChainType,
                fromBlockNumber: blockNumber,
                taskType: "BURN"
            }
        };
        return obj;
    }
};