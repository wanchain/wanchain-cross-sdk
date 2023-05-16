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
            let options = {chainType: params.scChainType, from: params.fromAddr, coinValue: params.networkFee};
            let scData = await txGeneratorService.generateCircleBridgeDeposit(params.crossScAddr, toChainInfo.CircleBridge.domain, params.value, params.tokenAccount, params.userAccount, options);
            let txData = await txGeneratorService.generateTx(params.scChainType, scData.gasLimit, params.crossScAddr, params.networkFee, scData.data, params.fromAddr);
            await this.sendTransactionData(stepData, txData, wallet);
        } catch (err) {
            console.error("ProcessCircleBridgeDeposit error: %O", err);
            this.m_WebStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", strFailed, tool.getErrMsg(err, "Failed to send transaction"));
        }
    }

    // virtual function
    async getConvertInfoForCheck(stepData) {
        let params = stepData.params;
        let tokenPairService = this.m_frameworkService.getService("TokenPairService");
        let tokenPair = tokenPairService.getTokenPair(params.tokenPairID);
        let direction = (params.scChainType === tokenPair.fromChainType);
        let depositChain = direction? tokenPair.fromChainType : tokenPair.toChainType;
        let depositChainInfo = direction? tokenPair.fromScInfo : tokenPair.toScInfo;
        let checkChain = direction? tokenPair.toChainType : tokenPair.fromChainType;
        let storemanService = this.m_frameworkService.getService("StoremanService");
        let blockNumber = await storemanService.getChainBlockNumber(checkChain);
        let checker = {
          needCheck: true,
          checkInfo: {
            ccTaskId: params.ccTaskId,
            uniqueID: stepData.txHash,
            chain: checkChain,
            fromBlockNumber: blockNumber,
            taskType: "circleMINT",
            depositChain,
            depositDomain: depositChainInfo.CircleBridge.domain,
            depositNonce: undefined, // deposit nonce is really uniqueID
            depositAmount: 0
          }
        };
        return checker;
    }
};