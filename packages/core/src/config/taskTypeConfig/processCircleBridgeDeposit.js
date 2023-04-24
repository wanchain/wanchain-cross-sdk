'use strict';

const tool = require("../../utils/tool.js");
const ProcessBase = require("./processBase.js");

module.exports = class ProcessCircleBridgeDeposit extends ProcessBase {
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
            let tokenPairService = this.m_frameworkService.getService("TokenPairService");
            let tokenPair = tokenPairService.getTokenPair(params.tokenPairID);
            let toChainInfo = (params.scChainType === tokenPair.fromChainType)? tokenPair.toScInfo : tokenPair.fromScInfo;
            let scData = await txGeneratorService.generateCircleBridgeDeposit(params.crossScAddr, toChainInfo.CircleBridge.domain, params.value, params.tokenAccount, params.userAccount);
            let txData = await txGeneratorService.generateTx(params.scChainType, params.gasPrice, params.gasLimit, params.crossScAddr.toLowerCase(), params.fee, scData, params.fromAddr.toLowerCase());
            await this.sendTransactionData(stepData, txData, wallet);
        } catch (err) {
            console.error("ProcessCircleBridgeDeposit error: %O", err);
            this.m_WebStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", strFailed, tool.getErrMsg(err, "Failed to send transaction"));
        }
    }

    // virtual function
    async getConvertInfoForCheck(stepData) {
        let params = stepData.params;
        let tokenPairService = this.m_frameworkService.getService("TokenPairService");
        let tokenPair = tokenPairService.getTokenPair(params.tokenPairID);
        let direction = (params.scChainType === tokenPair.fromChainType)? "MINT" : "BURN";
        let checkChainType = (direction === "MINT")? tokenPair.toChainType : tokenPair.fromChainType;
        let storemanService = this.m_frameworkService.getService("StoremanService");
        let blockNumber = await storemanService.getChainBlockNumber(checkChainType);
        // exception: burn legency EOS from ethereum to wanchain is "BURN"
        let taskType = tokenPairService.getTokenEventType(params.tokenPairID, direction);
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
            toAddr: params.toAddr,
            bridge: tokenPair.bridge,
            // claim: {msg, msgHash, attestation}, // to fill later
          }
        };
        return checker;
    }
};