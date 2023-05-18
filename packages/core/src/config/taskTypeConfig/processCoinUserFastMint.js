'use strict';

const BigNumber = require("bignumber.js");
const tool = require("../../utils/tool.js");
const ProcessBase = require("./processBase.js");

module.exports = class ProcessCoinUserFastMint extends ProcessBase {
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
            let txData, crossValue = new BigNumber(params.value).minus(params.networkFee);
            if (wallet.generateUserLockData) { // wallet custumized
              txData = await wallet.generateUserLockData(params.crossScAddr,
                params.storemanGroupId,
                params.tokenPairID,
                crossValue,
                params.userAccount,
                {coinValue: params.value});
            } else { // common evm
              let scData = await this.m_txGeneratorService.generateUserLockData(params.crossScAddr,
                  params.storemanGroupId,
                  params.tokenPairID,
                  crossValue,
                  params.userAccount,
                  {tokenType: "Erc20", chainType: params.scChainType, from: params.fromAddr, coinValue: params.value});
              txData = await this.m_txGeneratorService.generateTx(params.scChainType, scData.gasLimit, params.crossScAddr, params.value, scData.data, params.fromAddr);
            }
            await this.sendTransactionData(stepData, txData, wallet);
        } catch (err) {
            console.error("ProcessCoinUserFastMint error: %O", err);
            this.m_WebStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", strFailed, tool.getErrMsg(err, "Failed to send transaction"));
        }
    }

    // virtual function
    async getConvertInfoForCheck(stepData) {
        let params = stepData.params;
        let tokenPair = this.m_tokenPairService.getTokenPair(params.tokenPairID);
        let direction = (params.scChainType === tokenPair.fromChainType)? "MINT" : "BURN";
        let checkChainType = (direction === "MINT")? tokenPair.toChainType : tokenPair.fromChainType;
        let taskType = this.m_tokenPairService.getTokenEventType(params.tokenPairID, direction);
        let blockNumber = await this.m_storemanService.getChainBlockNumber(checkChainType);
        let srcToken = (direction === "MINT")? tokenPair.fromAccount : tokenPair.toAccount;
        let txEventTopics = [
            "0x43eb196c5950c738b34cd1760941e0876559e4fb835498fe19016bc039ad61a9",     // UserLockLogger
            params.storemanGroupId,                                                   // smgID
            "0x" + new BigNumber(params.tokenPairID).toString(16).padStart(64, '0'),  // tokenPairID
            "0x" + tool.hexStrip0x(srcToken).toLowerCase().padStart(64, '0')          // tokenAccount
        ];
        let convertCheckInfo = {
            ccTaskId: params.ccTaskId,
            uniqueID: stepData.txHash,
            userAccount: params.userAccount,
            smgID: params.storemanGroupId,
            tokenPairID: params.tokenPairID,
            value: new BigNumber(params.value).minus(params.fee),
            chain: checkChainType,
            fromBlockNumber: blockNumber,
            taskType,
            fromChain: params.scChainType
        };
        return {txEventTopics, convertCheckInfo};
    }
};