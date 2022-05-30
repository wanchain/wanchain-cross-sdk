'use strict';

let BigNumber = require("bignumber.js");
let ProcessBase = require("./processBase.js");
// XRP: eth/wan -> Ripple
// BTC: eth/wan -> Bitcoin
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
// 参考 ProcessErc20UserFastBurn
module.exports = class ProcessBurnOtherCoinToAncestorChain extends ProcessBase {
  constructor(frameworkService) {
    super(frameworkService);
  }

  async process(paramsJson, wallet) {
    let uiStrService = this.m_frameworkService.getService("UIStrService");
    let strFailed = uiStrService.getStrByName("Failed");

    let params = paramsJson.params;
    try {
      if (!(await this.checkChainId(paramsJson, wallet))) {
        return;
      }

      if (typeof params.value === "string") {
        params.value = new BigNumber(params.value);
      }
      let stroemanService = this.m_frameworkService.getService("StoremanService");
      let tokenPair = await stroemanService.getTokenPairObjById(params.tokenPairID);
      let allowance = await this.m_iwanBCConnector.getErc20Allowance(
        params.scChainType,
        tokenPair.toAccount,
        params.fromAddr,
        params.crossScAddr,
        tokenPair.toScInfo.erc20AbiJson);
      let bn_allowance = new BigNumber(allowance);
      if (bn_allowance.isLessThan(params.value)) {
        this.m_WebStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, paramsJson.stepIndex, "", strFailed, "Insufficient ERC20 token allowance");
        return;
      }

      let txGeneratorService = this.m_frameworkService.getService("TxGeneratorService");
      console.log("ProcessBurnOtherCoinToAncestorChain params:", params);
      let scData = await txGeneratorService.generateUserBurnData(params.crossScAddr,
        params.crossScAbi,
        params.storemanGroupId,
        params.tokenPairID,
        params.value,
        params.userBurnFee,
        params.tokenAccount,
        params.userAccount);

      let txValue = params.fee;
      let txData = await txGeneratorService.generateTx(params.scChainType, params.gasPrice, params.gasLimit, params.crossScAddr.toLowerCase(), txValue, scData, params.fromAddr.toLowerCase());
      await this.sendTransactionData(paramsJson, txData, wallet);
      return;
    }
    catch (err) {
      console.error("ProcessUserFastBurn process err: %O", err);
      this.m_WebStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, paramsJson.stepIndex, "", strFailed, "Failed to generate transaction data");
    }
  }

  // virtual function
  async getConvertInfoForCheck(paramsJson) {
    console.log("getConvertInfoForCheck paramsJson:", paramsJson);
    let storemanService = this.m_frameworkService.getService("StoremanService");
    let tokenPairObj = await storemanService.getTokenPairObjById(paramsJson.params.tokenPairID);
    let blockNumber;
    if (tokenPairObj.fromChainType === "XRP") {
      blockNumber = await this.m_iwanBCConnector.getLedgerVersion(tokenPairObj.fromChainType);
    }
    else if (tokenPairObj.fromChainType === "DOT") {
      blockNumber = 0;
      console.log("getConvertInfoForCheck DOT blockNumber");
    }
    else {
      blockNumber = await this.m_iwanBCConnector.getBlockNumber(tokenPairObj.fromChainType);
    }
    let obj = {
      needCheck: true,
      checkInfo: {
        "ccTaskId": paramsJson.params.ccTaskId,
        "uniqueID": paramsJson.txhash,
        "userAccount": paramsJson.params.userAccount,
        "smgID": paramsJson.params.storemanGroupId,
        "tokenPairID": paramsJson.params.tokenPairID,
        "value": paramsJson.params.value,
        "chain": tokenPairObj.fromChainType,
        "fromBlockNumber": blockNumber,
        "taskType": "BURN",
        "fromChain": tokenPairObj.toChainType,
        "fromAddr": paramsJson.params.fromAddr,
        "chainHash": paramsJson.txhash,
        "toAddr": paramsJson.params.toAddr
      }
    };
    console.log("getConvertInfoForCheck paramsJson obj:", obj);
    return obj;
  }
};