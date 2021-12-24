'use strict';

const BigNumber = require("bignumber.js");
const tool = require('../../utils/tool.js');

module.exports = class BurnErc20ProxyToken {
  constructor(frameworkService) {
    this.m_frameworkService = frameworkService;
    this.m_WebStores = frameworkService.getService("WebStores");
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

    let retAry = [];

    // Erc20
    let value = new BigNumber(convert.value).multipliedBy(Math.pow(10, tokenPair.decimals));
    // check erc20 token
    let nativeToken, poolToken, chainInfo;
    if (convert.convertType === "MINT") {
      nativeToken = tokenPair.fromNativeToken;
      poolToken = tokenPair.fromAccount;
      chainInfo = tokenPair.fromScInfo;
    } else {
      nativeToken = tokenPair.toNativeToken;
      poolToken = tokenPair.toAccount;
      chainInfo = tokenPair.toScInfo;      
    }
    let approveMaxValue = new BigNumber(chainInfo.approveMaxValue);
    let erc20ApproveParaJson = {
      ccTaskId: convert.ccTaskId,
      fromAddr: convert.fromAddr,
      scChainType: chainInfo.chainType,
      erc20Addr: nativeToken,// token Addr
      gasPrice: chainInfo.gasPrice,
      gasLimit: chainInfo.erc20ApproveGasLimit,
      value: approveMaxValue,
      spenderAddr: poolToken,// poolAddr
      taskType: "ProcessErc20Approve",
      fee: new BigNumber(0)
    };
    console.debug("BurnErc20ProxyToken erc20ApproveParaJson params: %O", erc20ApproveParaJson);
    let allowance = await this.m_iwanBCConnector.getErc20Allowance(chainInfo.chainType,
      nativeToken,// tokenAddr
      convert.fromAddr, // account
      poolToken); // spender poolAddr
    allowance = new BigNumber(allowance);
    if (allowance.isGreaterThan(0)) {
      if (allowance.isLessThan(value)) {
        // 1 approve 0
        let erc20Approve0ParaJson = JSON.parse(JSON.stringify(erc20ApproveParaJson));
        erc20Approve0ParaJson.value = new BigNumber(0);
        retAry.push({name: "erc20Approve0", stepIndex: retAry.length + 1, title: this.m_strApprove0Title, desc: this.m_strApprove0Desc, params: erc20Approve0ParaJson });
        // 2 approve
        retAry.push({name: "erc20Approve", stepIndex: retAry.length + 1, title: this.m_strApproveValueTitle, desc: this.m_strApproveValueDesc, params: erc20ApproveParaJson });
      } else {
        // allowance >= value,无需approve
      }
    } else {
      // 1 approve
      retAry.push({name: "erc20Approve", stepIndex: retAry.length + 1, title: this.m_strApproveValueTitle, desc: this.m_strApproveValueDesc, params: erc20ApproveParaJson });
    }

    // function userFastBurn(bytes32 smgID, uint tokenPairID, uint value, bytes userAccount)  
    let unit = tool.getCoinSymbol(chainInfo.chainType, chainInfo.chainName);
    let networkFee = tool.parseFee(convert.fee, convert.value, unit, chainInfo.chainDecimals, false);
    let operateFee = tool.parseFee(convert.fee, convert.value, tokenPair.ancestorSymbol, tokenPair.decimals, false);
    let userFastBurnParaJson = {
      ccTaskId: convert.ccTaskId,
      fromAddr: convert.fromAddr,
      scChainType: chainInfo.chainType,
      crossScAddr: chainInfo.crossScAddr,
      gasPrice: chainInfo.gasPrice,
      gasLimit: chainInfo.erc20FastBurnGasLimit,
      storemanGroupId: convert.storemanGroupId,
      tokenPairID: convert.tokenPairId,
      value: value,
      userAccount: convert.toAddr,
      taskType: "ProcessBurnErc20ProxyToken",
      fee: networkFee,
      tokenAccount: poolToken,
      userBurnFee: operateFee
    };
    console.debug("BurnErc20ProxyToken userFastBurnParaJson params: %O", userFastBurnParaJson);
    retAry.push({name: "userFastBurnParaJson", stepIndex: retAry.length + 1, title: this.m_strBurnTitle, desc: this.m_strBurnDesc, params: userFastBurnParaJson });

    let chainId = await convert.wallet.getChainId();
    for (let idx = 0; idx < retAry.length; ++idx) {
      retAry[idx].params.chainId = chainId;
    }
    //console.log("BurnErc20ProxyToken retAry:", retAry);
    let utilService = this.m_frameworkService.getService("UtilService");
    if (await utilService.checkBalanceGasFee(retAry, chainInfo.chainType, convert.fromAddr, networkFee)) {
      this.m_WebStores["crossChainTaskSteps"].setTaskSteps(convert.ccTaskId, retAry);
      return {
        stepNum: retAry.length,
        errCode: null
      };
    }
    else {
      console.error("BurnErc20ProxyToken insufficient gas");
      this.m_WebStores["crossChainTaskSteps"].setTaskSteps(convert.ccTaskId, []);
      return {
        stepNum: 0,
        errCode: globalConstant.ERR_INSUFFICIENT_GAS
      };
    }
  }
}


