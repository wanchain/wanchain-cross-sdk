'use strict';
let BigNumber = require("bignumber.js");

module.exports = class MintErc20Handle {
  constructor(frameworkService) {
    this.m_frameworkService = frameworkService;
    this.m_WebStores = frameworkService.getService("WebStores");
    this.m_taskService = frameworkService.getService("TaskService");
    this.m_iwanBCConnector = frameworkService.getService("iWanConnectorService");
  }

  async checkErc20Allowance(chain, scAddr, ownerAddr, spenderAddr, scAbi) {
    let ret = await this.m_iwanBCConnector.callScFunc(chain,
      scAddr,
      "allowance",
      [ownerAddr, spenderAddr],
      scAbi);
    return ret;
  }

  async process(tokenPairObj, convertJson) {
    let globalConstant = this.m_frameworkService.getService("GlobalConstant");

    this.m_uiStrService = this.m_frameworkService.getService("UIStrService");
    this.m_strApprove0Title = this.m_uiStrService.getStrByName("approve0Title");
    this.m_strApproveValueTitle = this.m_uiStrService.getStrByName("approveValueTitle");

    this.m_strApprove0Desc = this.m_uiStrService.getStrByName("approve0Desc");
    this.m_strApproveValueDesc = this.m_uiStrService.getStrByName("approveValueDesc");

    this.m_strMintTitle = this.m_uiStrService.getStrByName("MintTitle");
    this.m_strMintDesc = this.m_uiStrService.getStrByName("MintDesc");

    // Erc20
    let decimals = Number(tokenPairObj.fromDecimals);
    let value = new BigNumber(convertJson.value);
    let pows = new BigNumber(Math.pow(10, decimals));
    value = value.multipliedBy(pows);
    // check erc20 token
    let tokenBalance = await this.m_iwanBCConnector.getTokenBalance(tokenPairObj.fromChainType, convertJson.fromAddr, tokenPairObj.fromAccount);
    let balance = new BigNumber(tokenBalance);
    if (balance.isLessThan(value)) {
      console.log("MintErc20Handle 2 tokenBalance:", balance, " <= value:", value);
      this.m_WebStores["crossChainTaskSteps"].setTaskSteps(convertJson.ccTaskId, []);
      return {
        stepNum: 0,
        errCode: globalConstant.ERR_INSUFFICIENT_TOKEN_BALANCE
      };
    }

    let approveMaxValue = new BigNumber(tokenPairObj.fromScInfo.approveMaxValue);
    let erc20ApproveParaJson = {
      "ccTaskId": convertJson.ccTaskId,
      "fromAddr": convertJson.fromAddr,
      "scChainType": tokenPairObj.fromChainType,
      "erc20Addr": tokenPairObj.fromAccount,
      "erc20Abi": tokenPairObj.fromScInfo.erc20AbiJson,
      "gasPrice": tokenPairObj.fromScInfo.gasPrice,
      "gasLimit": tokenPairObj.fromScInfo.erc20ApproveGasLimit,
      "value": approveMaxValue,
      "spenderAddr": tokenPairObj.fromScInfo.crossScAddr,
      "taskType": "ProcessErc20Approve",
      "fee": new BigNumber(0)
    };

    let allowance = await this.checkErc20Allowance(tokenPairObj.fromChainType,
      tokenPairObj.fromAccount,
      convertJson.fromAddr,
      tokenPairObj.fromScInfo.crossScAddr,
      tokenPairObj.fromScInfo.erc20AbiJson);
    let bn_allowance = new BigNumber(allowance);
    let retAry = [];
    if (bn_allowance.isGreaterThan(0)) {
      if (bn_allowance.isLessThan(value)) {
        // 1 approve 0
        let erc20Approve0ParaJson = JSON.parse(JSON.stringify(erc20ApproveParaJson));
        erc20Approve0ParaJson.value = new BigNumber(0);
        retAry.push({ "name": "erc20Approve0", "stepIndex": retAry.length + 1, "title": this.m_strApprove0Title, "desc": this.m_strApprove0Desc, "params": erc20Approve0ParaJson });

        // 2 approve
        retAry.push({ "name": "erc20Approve", "stepIndex": retAry.length + 1, "title": this.m_strApproveValueTitle, "desc": this.m_strApproveValueDesc, "params": erc20ApproveParaJson });
      }
      else {
        // 无需approve
      }
    }
    else {
      // 1 approve
      retAry.push({ "name": "erc20Approve", "stepIndex": retAry.length + 1, "title": this.m_strApproveValueTitle, "desc": this.m_strApproveValueDesc, "params": erc20ApproveParaJson });
    }

    //  Erc20UserFastMint
    //   function userFastMint(bytes32 smgID, uint tokenPairID, uint value, bytes userAccount)
    let crossChainFeesService = this.m_frameworkService.getService("CrossChainFeesService");
    let fees = await crossChainFeesService.getServcieFees(tokenPairObj.id, "MINT");
    let userErc20FastMintParaJson = {
      "ccTaskId": convertJson.ccTaskId,
      "fromAddr": convertJson.fromAddr,
      "scChainType": tokenPairObj.fromChainType,
      "crossScAddr": tokenPairObj.fromScInfo.crossScAddr,
      "crossScAbi": tokenPairObj.fromScInfo.crossScAbiJson,
      "gasPrice": tokenPairObj.fromScInfo.gasPrice,
      "gasLimit": tokenPairObj.fromScInfo.erc20FastMintGasLimit,
      "storemanGroupId": convertJson.storemanGroupId,
      "tokenPairID": convertJson.tokenPairId,
      "value": value,
      "userAccount": convertJson.toAddr,
      "taskType": "ProcessErc20UserFastMint",
      "fee": fees.mintFeeBN
    };
    retAry.push({ "name": "Erc20UserFastMint", "stepIndex": retAry.length + 1, "title": this.m_strMintTitle, "desc": this.m_strMintDesc, "params": userErc20FastMintParaJson });

    let accountService = await this.m_frameworkService.getService("AccountService");
    let chainId = await accountService.getChainId(userErc20FastMintParaJson.scChainType);
    for (let idx = 0; idx < retAry.length; ++idx) {
      retAry[idx].params.chainId = chainId;
    }
    //console.log("MintErc20Handle retAry:", retAry);
    let utilService = this.m_frameworkService.getService("UtilService");
    if (await utilService.checkBalanceGasFee(retAry, tokenPairObj.fromChainType, convertJson.fromAddr, fees.mintFeeBN)) {
      this.m_WebStores["crossChainTaskSteps"].setTaskSteps(convertJson.ccTaskId, retAry);
      return {
        stepNum: retAry.length,
        errCode: null
      };
    }
    else {
      console.log("MintErc20Handle balance < gas");
      this.m_WebStores["crossChainTaskSteps"].setTaskSteps(convertJson.ccTaskId, []);
      return {
        stepNum: 0,
        errCode: globalConstant.ERR_INSUFFICIENT_GAS
      };
    }
  }
};


