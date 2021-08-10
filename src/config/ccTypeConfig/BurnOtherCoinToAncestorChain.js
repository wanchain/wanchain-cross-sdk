'use strict';
let BigNumber = require("bignumber.js");
const Web3 = require("web3");
const web3 = new Web3();

// BTC: eth->btc 
//{
//    "id": "14",
//    "fromChainID": "2147483648",
//    "fromAccount": "0x0000000000000000000000000000000000000000",
//    "toChainID": "2147483708",
//    "toAccount": "0xab839532149d889a417e1275eab0b62b2ad32d09",
//    "ancestorSymbol": "BTC",
//    "ancestorDecimals": "8",
//    "ancestorAccount": "0x0000000000000000000000000000000000000000",
//    "ancestorName": "bitcoin",
//    "ancestorChainID": "2147483648",
//    "name": "wanBTC@Ethereum",
//    "symbol": "wanBTC",
//    "decimals": "8"
//};

// BTC: WAN->BTC
//{
//    "id": "15",
//    "fromChainID": "2147483648",
//    "fromAccount": "0x0000000000000000000000000000000000000000",
//    "toChainID": "2153201998",
//    "toAccount": "0x07fdb4e8f8e420d021b9abeb2b1f6dce150ef77c",
//    "ancestorSymbol": "BTC",
//    "ancestorDecimals": "8",
//    "ancestorAccount": "0x0000000000000000000000000000000000000000",
//    "ancestorName": "bitcoin",
//    "ancestorChainID": "2147483648",
//    "name": "wanBTC@wanchain",
//    "symbol": "wanBTC",
//    "decimals": "8"
//};

// XRP: wan->xrp
//{
//    "id": "18",
//    "fromChainID": "2147483792",
//    "fromAccount": "0x0000000000000000000000000000000000000000",
//    "toChainID": "2153201998",
//    "toAccount": "0x456a7a43f1bbb1c8bc5dacc8c801d7e495a71bcf",
//    "ancestorSymbol": "XRP",
//    "ancestorDecimals": "6",
//    "ancestorAccount": "0x0000000000000000000000000000000000000000",
//    "ancestorName": "xrp",
//    "ancestorChainID": "2147483792",
//    "name": "wanXRP@wanchain",
//    "symbol": "wanXRP",
//    "decimals": "6"
//};

module.exports = class BurnOtherCoinToAncestorChain {
  constructor(frameworkService) {
    this.m_frameworkService = frameworkService;
    this.m_WebStores = frameworkService.getService("WebStores");
    this.m_taskService = frameworkService.getService("TaskService");
    this.m_iwanBCConnector = frameworkService.getService("iWanConnectorService");
  }

  async checkErc20Allowance(chain, scAddr, ownerAddr, spenderAddr, scAbi) {
    let blockNumber = await this.m_iwanBCConnector.getBlockNumber(chain);
    let ret = await this.m_iwanBCConnector.callScFunc(chain,
      scAddr,
      "allowance",
      [ownerAddr, spenderAddr],
      scAbi);
    console.log("checkErc20Allowance chain:", chain, "blockNumber:", blockNumber, "allowance:", ret);
    return ret;
  }

  async process(tokenPairObj, convertJson) {
    let globalConstant = this.m_frameworkService.getService("GlobalConstant");

    //console.log("BurnOtherCoinToAncestorChain tokenPairObj:", tokenPairObj);
    //console.log("BurnOtherCoinToAncestorChain convertJson:", convertJson);
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
    let tokenBalance = await this.m_iwanBCConnector.getTokenBalance(tokenPairObj.toChainType, convertJson.fromAddr, tokenPairObj.toAccount);
    let balance = new BigNumber(tokenBalance);
    if (balance.isLessThan(value)) {
      console.log("BurnOtherCoinToAncestorChain 2 tokenBalance:", balance, " <= value:", value);
      this.m_WebStores["crossChainTaskSteps"].setTaskSteps(convertJson.ccTaskId, []);
      return {
        stepNum: 0,
        errCode: globalConstant.ERR_INSUFFICIENT_TOKEN_BALANCE
      };
    }
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

    let allowance = await this.checkErc20Allowance(tokenPairObj.toChainType,
      tokenPairObj.toAccount,
      convertJson.fromAddr,
      tokenPairObj.toScInfo.crossScAddr,
      tokenPairObj.toScInfo.erc20AbiJson);
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
    //console.log("sevice Fee:", fees);
    let userBurnFee = await crossChainFeesService.estimateBurnNetworkFee(tokenPairObj.id);
    //console.log("userBurnFee:", userBurnFee);

    let userAccount = web3.utils.asciiToHex(convertJson.toAddr);
    //console.log("convertJson.toAddr:", convertJson.toAddr, ",userAccount:", userAccount);

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
      //"userAccount": convertJson.toAddr,
      "userAccount": userAccount,
      "taskType": "ProcessBurnOtherCoinToAncestorChain",
      "fee": fees.burnFeeBN,
      "tokenAccount": tokenPairObj.toAccount,
      "userBurnFee": userBurnFee.originFeeBN,
      "toAddr": convertJson.toAddr
    };
    //console.log("ProcessBurnOtherCoinToAncestorChain value:", value, ",typeof value:", typeof value);
    retAry.push({ "name": "ProcessBurnOtherCoinToAncestorChain", "stepIndex": retAry.length + 1, "title": this.m_strBurnTitle, "desc": this.m_strBurnDesc, "params": userFastBurnParaJson });

    let chainId = await convertJson.wallet.getChainId();
    for (let idx = 0; idx < retAry.length; ++idx) {
      retAry[idx].params.chainId = chainId;
    }
    //console.log("BurnErc20Handle retAry:", retAry);
    let utilService = this.m_frameworkService.getService("UtilService");
    if (await utilService.checkBalanceGasFee(retAry, tokenPairObj.toChainType, convertJson.fromAddr, fees.burnFeeBN)) {
      this.m_WebStores["crossChainTaskSteps"].setTaskSteps(convertJson.ccTaskId, retAry);
      return {
        stepNum: retAry.length,
        errCode: null
      };
    }
    else {
      console.log("BurnOtherCoinToAncestorChain balance < gas");
      this.m_WebStores["crossChainTaskSteps"].setTaskSteps(convertJson.ccTaskId, []);
      return {
        stepNum: 0,
        errCode: globalConstant.ERR_INSUFFICIENT_GAS
      };
    }
  }
}


