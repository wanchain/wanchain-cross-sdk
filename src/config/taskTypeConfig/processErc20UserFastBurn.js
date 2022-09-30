'use strict';

const ProcessBase = require("./processBase.js");

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
            let txData;
            if (wallet.generateUserBurnData) { // wallet custumized
              txData = await wallet.generateUserBurnData(params.crossScAddr,
                params.storemanGroupId,
                params.tokenPairID,
                params.value,
                params.userBurnFee,
                params.tokenAccount,
                params.userAccount,
                {coinValue: params.fee});
            } else {
              let txGeneratorService = this.m_frameworkService.getService("TxGeneratorService");
              let scData = await txGeneratorService.generateUserBurnData(params.crossScAddr,
                  params.storemanGroupId,
                  params.tokenPairID,
                  params.value,
                  params.userBurnFee,
                  params.tokenAccount,
                  params.userAccount,
                  {tokenType: params.tokenType});
              txData = await txGeneratorService.generateTx(params.scChainType, params.gasPrice, params.gasLimit, params.crossScAddr.toLowerCase(), params.fee, scData, params.fromAddr.toLowerCase());
            }
            await this.sendTransactionData(stepData, txData, wallet);
        } catch (err) {
            console.error("ProcessErc20UserFastBurn error: %O", err);
            this.m_WebStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", strFailed, "Failed to send transaction");
        }
    }

    // virtual function
    async getConvertInfoForCheck(stepData) {
        let params = stepData.params;
        let storemanService = this.m_frameworkService.getService("StoremanService");
        let tokenPair = storemanService.getTokenPair(params.tokenPairID);
        let direction = (params.scChainType === tokenPair.fromChainType)? "MINT" : "BURN";
        let checkChainType = (direction === "MINT")? tokenPair.toChainType : tokenPair.fromChainType;
        let blockNumber;
        if (checkChainType === "XRP") {
          blockNumber = await this.m_iwanBCConnector.getLedgerVersion(checkChainType);
        } else if (["DOT", "ADA"].includes(checkChainType)) {
          blockNumber = 0;
          // console.log("getConvertInfoForCheck DOT/ADA blockNumber");
        } else {
          blockNumber = await this.m_iwanBCConnector.getBlockNumber(checkChainType);
        }
        // exception: burn legency EOS from ethereum to wanchain is "BURN"
        let taskType = storemanService.getTokenEventType(params.tokenPairID, direction);
        let checker = {
          needCheck: true,
          checkInfo: {
            ccTaskId: params.ccTaskId,
            uniqueID: stepData.txHash,
            userAccount: params.userAccount,
            smgID: params.storemanGroupId,
            tokenPairID: params.tokenPairID,
            value: params.value,
            chain: checkChainType,
            fromBlockNumber: blockNumber,
            taskType,
            fromChain: params.scChainType,
            fromAddr: params.fromAddr,
            chainHash: stepData.txHash,
            toAddr: params.toAddr
          }
        };
        return checker;
    }
};