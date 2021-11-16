'use strict';
let BigNumber = require("bignumber.js");

module.exports = class BurnErc20Handle {
  constructor(frameworkService) {
    this.m_frameworkService = frameworkService;
    this.m_WebStores = frameworkService.getService("WebStores");
    this.m_taskService = frameworkService.getService("TaskService");
    this.m_iwanBCConnector = frameworkService.getService("iWanConnectorService");
    this.configService = this.m_frameworkService.getService("ConfigService");
  }

  async checkErc20Allowance(chain, scAddr, ownerAddr, spenderAddr, scAbi) {
    let abi = this.configService.getAbi(scAbi);
    let ret = await this.m_iwanBCConnector.callScFunc(chain,
      scAddr,
      "allowance",
      [ownerAddr, spenderAddr],
      abi);
    return ret;
  }

  async process(tokenPairObj, convertJson) {
    //console.log("BurnErc20Handle tokenPairObj:", tokenPairObj);
    //console.log("BurnErc20Handle convertJson:", convertJson);
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
    let value = new BigNumber(convertJson.value).multipliedBy(Math.pow(10, tokenPairObj.toDecimals));
    let approveMaxValue = new BigNumber(tokenPairObj.toScInfo.approveMaxValue);
    let erc20ApproveParaJson = {
      "ccTaskId": convertJson.ccTaskId,
      "fromAddr": convertJson.fromAddr,
      "scChainType": tokenPairObj.toChainType,
      "erc20Addr": tokenPairObj.toAccount,
      "erc20Abi": tokenPairObj.toScInfo.erc20AbiJson,
      "gasPrice": tokenPairObj.toScInfo.gasPrice,
      "gasLimit": tokenPairObj.toScInfo.erc20ApproveGasLimit,
      "value": approveMaxValue,
      "spenderAddr": tokenPairObj.toScInfo.crossScAddr,
      "taskType": "ProcessErc20Approve",
      "fee": new BigNumber(0)
    };
    console.debug("BurnErc20Handle erc20ApproveParaJson params: %O", erc20ApproveParaJson);
    let allowance = await this.checkErc20Allowance(tokenPairObj.toChainType,
      tokenPairObj.toAccount,
      convertJson.fromAddr,
      tokenPairObj.toScInfo.crossScAddr,
      tokenPairObj.toScInfo.erc20AbiJson);
    allowance = new BigNumber(allowance);
    if (allowance.isGreaterThan(0)) {
      if (allowance.isLessThan(value)) {
        // 1 approve 0
        let erc20Approve0ParaJson = JSON.parse(JSON.stringify(erc20ApproveParaJson));
        erc20Approve0ParaJson.value = new BigNumber(0);
        retAry.push({ "name": "erc20Approve0", "stepIndex": retAry.length + 1, "title": this.m_strApprove0Title, "desc": this.m_strApprove0Desc, "params": erc20Approve0ParaJson });
        // 2 approve
        retAry.push({ "name": "erc20Approve", "stepIndex": retAry.length + 1, "title": this.m_strApproveValueTitle, "desc": this.m_strApproveValueDesc, "params": erc20ApproveParaJson });
      } else {
        // allowance >= value,无需approve
      }
    } else {
      // 1 approve
      retAry.push({ "name": "erc20Approve", "stepIndex": retAry.length + 1, "title": this.m_strApproveValueTitle, "desc": this.m_strApproveValueDesc, "params": erc20ApproveParaJson });
    }

    //   function userFastBurn(bytes32 smgID, uint tokenPairID, uint value, bytes userAccount)
    let userFastBurnParaJson = {
      "ccTaskId": convertJson.ccTaskId,
      "fromAddr": convertJson.fromAddr,
      "scChainType": tokenPairObj.toChainType,
      "crossScAddr": tokenPairObj.toScInfo.crossScAddr,
      "crossScAbi": tokenPairObj.toScInfo.crossScAbiJson,
      "gasPrice": tokenPairObj.toScInfo.gasPrice,
      "gasLimit": tokenPairObj.toScInfo.erc20FastBurnGasLimit,
      "storemanGroupId": convertJson.storemanGroupId,
      "tokenPairID": convertJson.tokenPairId,
      "value": value,
      "userAccount": convertJson.toAddr,
      "taskType": "ProcessErc20UserFastBurn",
      "fee": convertJson.fee.operateFee.rawValue,
      "tokenAccount": tokenPairObj.toAccount,
      "userBurnFee": convertJson.fee.networkFee.rawValue
    };
    console.debug("BurnErc20Handle userFastBurnParaJson params: %O", userFastBurnParaJson);
    retAry.push({ "name": "userFastBurnParaJson", "stepIndex": retAry.length + 1, "title": this.m_strBurnTitle, "desc": this.m_strBurnDesc, "params": userFastBurnParaJson });

    let chainId = await convertJson.wallet.getChainId();
    for (let idx = 0; idx < retAry.length; ++idx) {
      retAry[idx].params.chainId = chainId;
    }
    //console.log("BurnErc20Handle retAry:", retAry);
    let utilService = this.m_frameworkService.getService("UtilService");
    if (await utilService.checkBalanceGasFee(retAry, tokenPairObj.toChainType, convertJson.fromAddr, convertJson.fee.operateFee.rawValue)) {
      this.m_WebStores["crossChainTaskSteps"].setTaskSteps(convertJson.ccTaskId, retAry);
      return {
        stepNum: retAry.length,
        errCode: null
      };
    } else {
      console.error("BurnErc20Handle insufficient gas");
      this.m_WebStores["crossChainTaskSteps"].setTaskSteps(convertJson.ccTaskId, []);
      return {
        stepNum: 0,
        errCode: globalConstant.ERR_INSUFFICIENT_GAS
      };
    }
  }
}


