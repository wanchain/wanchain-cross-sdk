'use strict';

const BigNumber = require("bignumber.js");
const tool = require("../../utils/tool.js");
const ProcessBase = require("./processBase.js");

module.exports = class ProcessErc20UserFastMint extends ProcessBase {
    constructor(frameworkService) {
        super(frameworkService);
    }

    async process(stepData, wallet) {
        let strFailed = this.m_uiStrService.getStrByName("Failed");
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
                {coinValue: params.fee});
            } else {
              let scData = await this.m_txGeneratorService.generateUserLockData(params.crossScAddr,
                params.storemanGroupId,
                params.tokenPairID,
                params.value,
                params.userAccount,
                {tokenType: params.tokenType, chainType: params.scChainType, from: params.fromAddr, coinValue: params.fee});
              txData = await this.m_txGeneratorService.generateTx(params.scChainType, scData.gasLimit, params.crossScAddr, params.fee, scData.data, params.fromAddr);
            }
            await this.sendTransactionData(stepData, txData, wallet);
        } catch (err) {
            console.error("ProcessErc20UserFastMint error: %O", err);
            this.m_WebStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", strFailed, tool.getErrMsg(err, "Failed to send transaction"));
        }
    }

    // virtual function
    async getConvertInfoForCheck(stepData) {
        let params = stepData.params;
        let tokenPair = this.m_tokenPairService.getTokenPair(params.tokenPairID);
        let direction = (params.scChainType === tokenPair.fromChainType)? "MINT" : "BURN";
        let checkChainType = (direction === "MINT")? tokenPair.toChainType : tokenPair.fromChainType;
        let blockNumber = await this.m_storemanService.getChainBlockNumber(checkChainType);
        // exception: burn legency EOS from ethereum to wanchain is "BURN"
        let taskType = this.m_tokenPairService.getTokenEventType(params.tokenPairID, direction);
        let srcToken = (direction === "MINT")? tokenPair.fromAccount : tokenPair.toAccount;
        let txEventTopics = [];
        let topic0 = (params.tokenType === "Erc20")? "0x43eb196c5950c738b34cd1760941e0876559e4fb835498fe19016bc039ad61a9" : "0x62605e96f2f9cd2d124a846c58ea7d9982610ba45d052c99b14900c37a718683";
        txEventTopics.push(topic0); // UserLockLogger / UserLockNFT
        txEventTopics.push(params.storemanGroupId);                                                   // smgID
        txEventTopics.push("0x" + new BigNumber(params.tokenPairID).toString(16).padStart(64, '0'));  // tokenPairID
        txEventTopics.push("0x" + tool.hexStrip0x(srcToken).toLowerCase().padStart(64, '0'));         // tokenAccount
        let convertCheckInfo = {
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
        };
        return {txEventTopics, convertCheckInfo};
    }
};