'use strict';

const BigNumber = require("bignumber.js");
const tool = require('../../utils/tool.js');

module.exports = class BurnErc20ProxyToken {
  constructor(frameworkService) {
    this.m_iwanBCConnector = frameworkService.getService("iWanConnectorService");
    this.m_uiStrService = frameworkService.getService("UIStrService");
    this.m_chainInfoService = frameworkService.getService("ChainInfoService");
  }

  async process(tokenPair, convert) {
    let strApprove0Title = this.m_uiStrService.getStrByName("approve0Title");
    let strApproveValueTitle = this.m_uiStrService.getStrByName("approveValueTitle");
    let strApprove0Desc = this.m_uiStrService.getStrByName("approve0Desc");
    let strApproveValueDesc = this.m_uiStrService.getStrByName("approveValueDesc");
    let strBurnTitle = this.m_uiStrService.getStrByName("BurnTitle");
    let strBurnDesc = this.m_uiStrService.getStrByName("BurnDesc");

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
        steps.push({name: "erc20Approve0", stepIndex: steps.length + 1, title: strApprove0Title, desc: strApprove0Desc, params: erc20Approve0ParaJson });
        // 2 approve
        steps.push({name: "erc20Approve", stepIndex: steps.length + 1, title: strApproveValueTitle, desc: strApproveValueDesc, params: erc20ApproveParas });
      } else {
        // allowance >= value,无需approve
      }
    } else {
      // 1 approve
      steps.push({name: "erc20Approve", stepIndex: steps.length + 1, title: strApproveValueTitle, desc: strApproveValueDesc, params: erc20ApproveParas });
    }

    // function userFastBurn(bytes32 smgID, uint tokenPairID, uint value, bytes userAccount)  
    let unit = this.m_chainInfoService.getCoinSymbol(chainInfo.chainType);
    let networkFee = tool.parseFee(convert.fee, convert.value, unit, {formatWithDecimals: false});
    let operateFee = tool.parseFee(convert.fee, convert.value, tokenPair.readableSymbol, {formatWithDecimals: false});
    let userFastBurnParas = {
      ccTaskId: convert.ccTaskId,
      fromAddr: convert.fromAddr,
      scChainType: chainInfo.chainType,
      crossScAddr: chainInfo.crossScAddr,
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
    steps.push({name: "userFastBurn", stepIndex: steps.length + 1, title: strBurnTitle, desc: strBurnDesc, params: userFastBurnParas});

    let chainId = await convert.wallet.getChainId();
    for (let idx = 0; idx < steps.length; ++idx) {
      steps[idx].params.chainId = chainId;
    }
    //console.debug("BurnErc20ProxyToken steps:", steps);
    return steps;
  }
}


