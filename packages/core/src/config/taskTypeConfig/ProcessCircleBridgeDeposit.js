'use strict';

const tool = require("../../utils/tool.js");
const ProcessBase = require("./processBase.js");
const axios = require("axios");

module.exports = class ProcessCircleBridgeDeposit extends ProcessBase {
    constructor(frameworkService) {
        super(frameworkService);
        this.storemanService = frameworkService.getService("StoremanService");
    }

    async process(stepData, wallet) {
        let strFailed = this.m_uiStrService.getStrByName("Failed");
        let params = stepData.params;
        try {
            if (!(await this.checkChainId(stepData, wallet))) {
                return;
            }
            let tokenPair = this.m_tokenPairService.getTokenPair(params.tokenPairID);
            let toChainInfo = (params.scChainType === tokenPair.fromChainType)? tokenPair.toScInfo : tokenPair.fromScInfo;
            let options = {chainType: params.scChainType, from: params.fromAddr, coinValue: params.networkFee};
            let scData = await this.m_txGeneratorService.generateCircleBridgeDeposit(params.crossScAddr, toChainInfo.CircleBridge.domain, params.value, params.tokenAccount, params.userAccount, options);
            let txData = await this.m_txGeneratorService.generateTx(params.scChainType, scData.gasLimit, params.crossScAddr, params.networkFee, scData.data, params.fromAddr);
            if (toChainInfo.chainType === "SOL") { // register wallet address before sending tx and it must be successful, otherwise agent may not process it
              await this.storemanService.registerSolWalletAddress(params.innerToAddr, params.toAddr);
            }
            await this.sendTransactionData(stepData, txData, wallet);
        } catch (err) {
            console.error("ProcessCircleBridgeDeposit error: %O", err);
            this.m_WebStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", strFailed, tool.getErrMsg(err, "Failed to send transaction"));
        }
    }

    // virtual function
    async getConvertInfoForCheck(stepData) {
        let params = stepData.params;
        let tokenPair = this.m_tokenPairService.getTokenPair(params.tokenPairID);
        let direction = (params.scChainType === tokenPair.fromChainType);
        let depositChain = direction? tokenPair.fromChainType : tokenPair.toChainType;
        let depositChainInfo = direction? tokenPair.fromScInfo : tokenPair.toScInfo;
        let checkChain = direction? tokenPair.toChainType : tokenPair.fromChainType;
        let storemanService = this.m_frameworkService.getService("StoremanService");
        let blockNumber = await storemanService.getChainBlockNumber(checkChain);
        let txEventTopics = [
            "0x6dce5b2406630dbc3a2633f31a15505733a9ede5169532aaab88ac01c77ff1e4",     // DepositForBurnWithFee
        ];
        let convertCheckInfo = {
            ccTaskId: params.ccTaskId,
            txHash: stepData.txHash,
            uniqueID: "0x" + tool.hexStrip0x(stepData.txHash),
            chain: checkChain,
            fromBlockNumber: blockNumber,
            taskType: "circleMINT",
            fromChain: depositChain,
            depositDomain: depositChainInfo.CircleBridge.domain,
            depositNonce: undefined, // deposit nonce is really uniqueID
            depositAmount: 0
        };
        return {txEventTopics, convertCheckInfo};
    }
};