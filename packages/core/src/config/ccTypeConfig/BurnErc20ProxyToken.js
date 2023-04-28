'use strict';

const BigNumber = require("bignumber.js");
const tool = require('../../utils/tool.js');

module.exports = class BurnErc20ProxyToken {
  constructor(frameworkService) {
    this.m_frameworkService = frameworkService;
    this.m_taskService = frameworkService.getService("TaskService");
    this.m_iwanBCConnector = frameworkService.getService("iWanConnectorService");
  }

  async process(tokenPair, convert) {
    let globalConstant = this.m_frameworkService.getService("GlobalConstant");
    this.m_uiStrService = this.m_frameworkService.getService("UIStrService");
    this.m_strApprove0Title = this.m_uiStrService.getStrByName("approve0Title");
    this.m_strApproveValueTitle = this.m_uiStrService.getStrByName("approveValueTitle");
    this.m_strApprove0Desc = this.m_uiStrService.getStrByName("approve0Desc");
    this.m_strApproveValueDesc = this.m_uiStrService.getStrByName("approveValueDesc");
    this.m_strBurnTitle = this.m_uiStrService.getStrByName("BurnTitle");
    this.m_strBurnDesc = this.m_uiStrService.getStrByName("BurnDesc");

    let steps = [];

    // check erc20 token
    let nativeToken, poolToken, chainInfo, decimals;
    if (convert.convertType === "MINT") {
      nativeToken = tokenPair.fromNativeToken;
      poolToken = tokenPair.fromAccount;
      chainInfo = tokenPair.fromScInfo;
      decimals = tokenPair.fromDecimals;
    } else {
      nativeToken = tokenPair.toNativeToken;
      poolToken = tokenPair.toAccount;
      chainInfo = tokenPair.toScInfo;
      decimals = tokenPair.toDecimals;
    }
    let approveMaxValue = "115792089237316195423570985008687907853269984665640564039457584007913129639935"; // max
    let erc20ApproveParas = {
      ccTaskId: convert.ccTaskId,
      fromAddr: convert.fromAddr,
      scChainType: chainInfo.chainType,
      erc20Addr: nativeToken,// token Addr
      gasPrice: chainInfo.gasPrice,
      gasLimit: chainInfo.approveGasLimit,
      value: approveMaxValue,
      spenderAddr: poolToken,// poolAddr
      taskType: "ProcessErc20Approve"
    };
    console.debug("BurnErc20ProxyToken erc20ApproveParas: %O", erc20ApproveParas);
    let value = new BigNumber(convert.value).multipliedBy(Math.pow(10, decimals));
    let allowance = await this.m_iwanBCConnector.getErc20Allowance(chainInfo.chainType,
      nativeToken,// tokenAddr
      convert.fromAddr, // account
      poolToken); // spender poolAddr
    allowance = new BigNumber(allowance);
    if (allowance.isGreaterThan(0)) {
      if (allowance.isLessThan(value)) {
        // 1 approve 0
        let erc20Approve0ParaJson = JSON.parse(JSON.stringify(erc20ApproveParas));
        erc20Approve0ParaJson.value = new BigNumber(0);
        steps.push({name: "erc20Approve0", stepIndex: steps.length + 1, title: this.m_strApprove0Title, desc: this.m_strApprove0Desc, params: erc20Approve0ParaJson });
        // 2 approve
        steps.push({name: "erc20Approve", stepIndex: steps.length + 1, title: this.m_strApproveValueTitle, desc: this.m_strApproveValueDesc, params: erc20ApproveParas });
      } else {
        // allowance >= value,无需approve
      }
    } else {
      // 1 approve
      steps.push({name: "erc20Approve", stepIndex: steps.length + 1, title: this.m_strApproveValueTitle, desc: this.m_strApproveValueDesc, params: erc20ApproveParas });
    }

    // function userFastBurn(bytes32 smgID, uint tokenPairID, uint value, bytes userAccount)  
    let unit = tool.getCoinSymbol(chainInfo.chainType, chainInfo.chainName);
    let networkFee = tool.parseFee(convert.fee, convert.value, unit, {formatWithDecimals: false});
    let operateFee = tool.parseFee(convert.fee, convert.value, tokenPair.readableSymbol, {formatWithDecimals: false});
    let userFastBurnParas = {
      ccTaskId: convert.ccTaskId,
      fromAddr: convert.fromAddr,
      scChainType: chainInfo.chainType,
      crossScAddr: chainInfo.crossScAddr,
      gasPrice: chainInfo.gasPrice,
      gasLimit: chainInfo.crossGasLimit,
      storemanGroupId: convert.storemanGroupId,
      tokenPairID: convert.tokenPairId,
      value: value,
      userAccount: convert.toAddr,
      taskType: "ProcessBurnErc20ProxyToken",
      fee: networkFee,
      tokenAccount: poolToken,
      userBurnFee: operateFee
    };
    console.debug("BurnErc20ProxyToken userFastBurnParas: %O", userFastBurnParas);
    steps.push({name: "userFastBurn", stepIndex: steps.length + 1, title: this.m_strBurnTitle, desc: this.m_strBurnDesc, params: userFastBurnParas});

    let chainId = await convert.wallet.getChainId();
    for (let idx = 0; idx < steps.length; ++idx) {
      steps[idx].params.chainId = chainId;
    }
    //console.log("BurnErc20ProxyToken steps:", steps);
    let utilService = this.m_frameworkService.getService("UtilService");
    if (await utilService.checkBalanceGasFee(steps, chainInfo.chainType, convert.fromAddr, networkFee)) {
      return steps;
    } else {
      console.error("BurnErc20ProxyToken insufficient gas");
      throw new Error(globalConstant.ERR_INSUFFICIENT_GAS);
    }
  }
}


