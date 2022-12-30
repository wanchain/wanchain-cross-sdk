'use strict';

const BigNumber = require("bignumber.js");
const tool = require('../../utils/tool.js');

module.exports = class MintCoinHandle {
  constructor(frameworkService) {
    this.m_frameworkService = frameworkService;
    this.m_WebStores = frameworkService.getService("WebStores");
    this.m_taskService = frameworkService.getService("TaskService");
    this.m_iwanBCConnector = frameworkService.getService("iWanConnectorService");
  }

  async process(tokenPair, convert) {
    this.m_uiStrService = this.m_frameworkService.getService("UIStrService");
    this.m_strMintTitle = this.m_uiStrService.getStrByName("MintTitle");
    this.m_strMintDesc = this.m_uiStrService.getStrByName("MintDesc");

    let value = new BigNumber(convert.value).multipliedBy(Math.pow(10, tokenPair.fromDecimals));
    let fee = tool.parseFee(convert.fee, convert.value, tokenPair.ancestorSymbol, {formatWithDecimals: false});
    let networkFee = tool.parseFee(convert.fee, convert.value, tokenPair.ancestorSymbol, {formatWithDecimals: false, feeType: "networkFee"});
    let params = {
      ccTaskId: convert.ccTaskId,
      fromAddr: convert.fromAddr,
      scChainType: tokenPair.fromChainType,
      crossScAddr: tokenPair.fromScInfo.crossScAddr,
      gasPrice: tokenPair.fromScInfo.gasPrice, // undefined, get from chain dynamiclly
      gasLimit: tokenPair.fromScInfo.crossGasLimit, // for tron is feeLimit
      storemanGroupId: convert.storemanGroupId,
      tokenPairID: convert.tokenPairId,
      value,
      userAccount: tool.getStandardAddressInfo(tokenPair.toChainType, convert.toAddr).evm,
      toAddr: convert.toAddr, // for readability
      taskType: "ProcessCoinUserFastMint",
      fee,
      networkFee
    };
    console.debug("MintCoinHandle params: %O", params);
    params.chainId = await convert.wallet.getChainId();
    let ret = [
      {name: "userFastMint", stepIndex: 1, title: this.m_strMintTitle, desc: this.m_strMintDesc, params}
    ];
    this.m_WebStores["crossChainTaskSteps"].setTaskSteps(convert.ccTaskId, ret);
    return {
      stepNum: ret.length,
      errCode: null
    };
  }
};
