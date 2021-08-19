'use strict';
let BigNumber = require("bignumber.js");

module.exports = class BurnErc20ProxyToken {
  constructor(frameworkService) {
    this.m_frameworkService = frameworkService;
    this.m_WebStores = frameworkService.getService("WebStores");
    this.m_taskService = frameworkService.getService("TaskService");
    this.m_iwanBCConnector = frameworkService.getService("iWanConnectorService");
  }

  async process(tokenPairObj, convertJson) {
    let globalConstant = this.m_frameworkService.getService("GlobalConstant");

    this.m_uiStrService = this.m_frameworkService.getService("UIStrService");
    this.m_strApprove0Title = this.m_uiStrService.getStrByName("approve0Title");
    this.m_strApproveValueTitle = this.m_uiStrService.getStrByName("approveValueTitle");

    this.m_strApprove0Desc = this.m_uiStrService.getStrByName("approve0Desc");
    this.m_strApproveValueDesc = this.m_uiStrService.getStrByName("approveValueDesc");

    this.m_strBurnTitle = this.m_uiStrService.getStrByName("BurnTitle");
    this.m_strBurnDesc = this.m_uiStrService.getStrByName("BurnDesc");

    // Erc20
    let decimals = Number(tokenPairObj.toDecimals);
    let value = new BigNumber(convertJson.value);
    let pows = new BigNumber(Math.pow(10, decimals));
    value = value.multipliedBy(pows);
    // check erc20 token
    let nativeToken, poolToken, chainInfo;
    if (convertJson.convertType === "MINT") {
      nativeToken = tokenPairObj.fromNativeToken;
      poolToken = tokenPairObj.fromAccount;
      chainInfo = tokenPairObj.fromScInfo;
    } else {
      nativeToken = tokenPairObj.toNativeToken;
      poolToken = tokenPairObj.toAccount;
      chainInfo = tokenPairObj.toScInfo;      
    }
    let tokenBalance = await this.m_iwanBCConnector.getTokenBalance(chainInfo.chainType, convertJson.fromAddr, nativeToken);
    let balance = new BigNumber(tokenBalance);
    if (balance.isLessThan(value)) {
      this.m_WebStores["crossChainTaskSteps"].setTaskSteps(convertJson.ccTaskId, []);
      return {
        stepNum: 0,
        errCode: globalConstant.ERR_INSUFFICIENT_TOKEN_BALANCE
      };
    }
    let approveMaxValue = new BigNumber(chainInfo.approveMaxValue);

    let erc20ApproveParaJson = {
      "ccTaskId": convertJson.ccTaskId,
      "fromAddr": convertJson.fromAddr,
      "scChainType": chainInfo.chainType,
      "erc20Addr": nativeToken,// token Addr
      "erc20Abi": chainInfo.erc20AbiJson,
      "gasPrice": chainInfo.gasPrice,
      "gasLimit": chainInfo.erc20ApproveGasLimit,
      "value": approveMaxValue,
      "spenderAddr": poolToken,// poolAddr
      "taskType": "ProcessErc20Approve",
      "fee": new BigNumber(0)
    };
    let allowance = await this.m_iwanBCConnector.getErc20Allowance(chainInfo.chainType,
      nativeToken,// tokenAddr
      convertJson.fromAddr, // account
      poolToken,// spender poolAddr
      chainInfo.erc20AbiJson);
    let retAry = [];
    allowance = new BigNumber(allowance);
    if (allowance.isGreaterThan(0)) {
      if (allowance.isLessThan(value)) {
        // 1 approve 0
        let erc20Approve0ParaJson = JSON.parse(JSON.stringify(erc20ApproveParaJson));
        erc20Approve0ParaJson.value = new BigNumber(0);
        retAry.push({ "name": "erc20Approve0", "stepIndex": retAry.length + 1, "title": this.m_strApprove0Title, "desc": this.m_strApprove0Desc, "params": erc20Approve0ParaJson });
        // 2 approve
        retAry.push({ "name": "erc20Approve", "stepIndex": retAry.length + 1, "title": this.m_strApproveValueTitle, "desc": this.m_strApproveValueDesc, "params": erc20ApproveParaJson });
      }
      else {
        // allowance >= value,无需approve
      }
    }
    else {
      // 1 approve
      retAry.push({ "name": "erc20Approve", "stepIndex": retAry.length + 1, "title": this.m_strApproveValueTitle, "desc": this.m_strApproveValueDesc, "params": erc20ApproveParaJson });
    }

    //   function userFastBurn(bytes32 smgID, uint tokenPairID, uint value, bytes userAccount)
    let crossChainFeesService = this.m_frameworkService.getService("CrossChainFeesService");
    let fees = await crossChainFeesService.getServcieFees(tokenPairObj.id, "BURN");
    let userBurnFee = await crossChainFeesService.estimateBurnNetworkFee(tokenPairObj.id);
    let userFastBurnParaJson = {
      "ccTaskId": convertJson.ccTaskId,
      "fromAddr": convertJson.fromAddr,
      "scChainType": chainInfo.chainType,
      "crossScAddr": chainInfo.crossScAddr,
      "crossScAbi": chainInfo.crossScAbiJson,
      "gasPrice": chainInfo.gasPrice,
      "gasLimit": chainInfo.erc20FastBurnGasLimit,
      "storemanGroupId": convertJson.storemanGroupId,
      "tokenPairID": convertJson.tokenPairId,
      "value": value,
      "userAccount": convertJson.toAddr,
      "taskType": "ProcessBurnErc20ProxyToken",
      "fee": fees.burnFeeBN,
      "tokenAccount": poolToken,
      "userBurnFee": userBurnFee.originFeeBN
    };
    retAry.push({ "name": "userFastBurnParaJson", "stepIndex": retAry.length + 1, "title": this.m_strBurnTitle, "desc": this.m_strBurnDesc, "params": userFastBurnParaJson });

    let chainId = await convertJson.wallet.getChainId();
    for (let idx = 0; idx < retAry.length; ++idx) {
      retAry[idx].params.chainId = chainId;
    }
    //console.log("BurnErc20ProxyToken retAry:", retAry);
    let utilService = this.m_frameworkService.getService("UtilService");
    if (await utilService.checkBalanceGasFee(retAry, chainInfo.chainType, convertJson.fromAddr, fees.burnFeeBN)) {
      this.m_WebStores["crossChainTaskSteps"].setTaskSteps(convertJson.ccTaskId, retAry);
      return {
        stepNum: retAry.length,
        errCode: null
      };
    }
    else {
      console.error("BurnErc20ProxyToken insufficient gas");
      this.m_WebStores["crossChainTaskSteps"].setTaskSteps(convertJson.ccTaskId, []);
      return {
        stepNum: 0,
        errCode: globalConstant.ERR_INSUFFICIENT_GAS
      };
    }
  }
}


