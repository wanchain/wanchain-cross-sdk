'use strict';

const BigNumber = require("bignumber.js");
const tool = require("../../utils/tool.js");
const ProcessBase = require("./processBase.js");

module.exports = class ProcessBurnErc20ProxyToken extends ProcessBase {
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
      let tokenPair = this.m_tokenPairService.getTokenPair(params.tokenPairID);
      let nativeToken, poolToken, chainInfo;
      if (params.scChainType === tokenPair.fromChainType) { // MINT
        nativeToken = tokenPair.fromNativeToken;
        poolToken = tokenPair.fromAccount;
        chainInfo = tokenPair.fromScInfo;
      } else {
        nativeToken = tokenPair.toNativeToken;
        poolToken = tokenPair.toAccount;
        chainInfo = tokenPair.toScInfo;      
      }
      let txValue = params.fee;
      let scData = await this.m_txGeneratorService.generateUserBurnData(params.crossScAddr,
        params.storemanGroupId,
        params.tokenPairID,
        params.value,
        params.userBurnFee,
        params.tokenAccount,
        params.userAccount,
        {tokenType: "Erc20", chainType: params.scChainType, from: params.fromAddr, coinValue: txValue});
      let txData = await this.m_txGeneratorService.generateTx(params.scChainType, scData.gasLimit, params.crossScAddr, txValue, scData.data, params.fromAddr);
      await this.sendTransactionData(stepData, txData, wallet);
    } catch (err) {
      console.error("ProcessBurnErc20ProxyToken error: %O", err);
      this.m_WebStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", strFailed, tool.getErrMsg(err, "Failed to send transaction"));
    }
  }

  // virtual function
  async getConvertInfoForCheck(stepData) {
    let params = stepData.params;
    let tokenPair = this.m_tokenPairService.getTokenPair(params.tokenPairID);
    let direction = (params.scChainType === tokenPair.fromChainType);
    let chainType = direction? tokenPair.toChainType : tokenPair.fromChainType;
    let blockNumber = await this.m_iwanBCConnector.getBlockNumber(chainType);
    let nativeToken = direction? tokenPair.toNativeToken : tokenPair.fromNativeToken;
    let taskType = nativeToken? "MINT" : "BURN"; // adapt to CheckScEvent task to scan SmgMintLogger or SmgReleaseLogger
    let srcToken = direction? tokenPair.fromAccount : tokenPair.toAccount;
    let txEventTopics = [
      "0xe314e23175856b9484e39ab0547753cf1b5cd0cbe3b0d7018c953d31f23fc767",     // UserBurnLogger
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
      value: params.value,
      chain: chainType,
      fromBlockNumber: blockNumber,
      taskType
    };
    return {txEventTopics, convertCheckInfo};
  }
};
