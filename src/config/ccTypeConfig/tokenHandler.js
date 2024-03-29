'use strict';

const Web3 = require("web3");
const BigNumber = require("bignumber.js");
const tool = require('../../utils/tool.js');
const CCTypeHandleInterface = require("./CCTypeHandleInterface.js");

const web3 = new Web3();

module.exports = class TokenHandler extends CCTypeHandleInterface { // ERC20 & ERC721
  constructor(frameworkService) {
    super();
    this.frameworkService = frameworkService;
    this.webStores = frameworkService.getService("WebStores");
    this.iWanConnectorService = frameworkService.getService("iWanConnectorService");
    this.utilService = this.frameworkService.getService("UtilService");
    this.uiStrService = this.frameworkService.getService("UIStrService");
    this.globalConstant = this.frameworkService.getService("GlobalConstant");
  }

  async process(tokenPair, convert) {  
    console.error("Unimplemented interface");
    return {
      stepNum: 0,
      errCode: this.globalConstant.ERR_OTHER_UNKNOWN_ERR
    };
  }

  async buildApproveSteps(steps, tokenPair, convert) {
    if (tokenPair.toAccountType === "Erc721") {
      return this.buildErc721Approve(steps, tokenPair, convert);
    } else { // defalut Erc20
      return this.buildErc20Approve(steps, tokenPair, convert);
    }
  }

  async buildErc20Approve(steps, tokenPair, convert) {
    let chainInfo = (convert.convertType === "MINT")? tokenPair.fromScInfo : tokenPair.toScInfo;
    let tokenSc = (convert.convertType === "MINT")? tokenPair.fromAccount : tokenPair.toAccount;
    let decimals = (convert.convertType === "MINT")? tokenPair.fromDecimals : tokenPair.toDecimals;
    let approveMaxValue = new BigNumber(chainInfo.approveMaxValue);
    let approveParams = {
      ccTaskId: convert.ccTaskId,
      fromAddr: convert.fromAddr,
      scChainType: chainInfo.chainType,
      erc20Addr: tokenSc,
      gasPrice: chainInfo.gasPrice,
      gasLimit: chainInfo.erc20ApproveGasLimit,
      value: approveMaxValue,
      spenderAddr: chainInfo.crossScAddr,
      taskType: "ProcessErc20Approve"
    };
    console.debug("TokenHandler buildErc20Approve %s params: %O", convert.convertType, approveParams);
    let allowance = await this.iWanConnectorService.getErc20Allowance(chainInfo.chainType,
      tokenSc,
      convert.fromAddr,
      chainInfo.crossScAddr);
    allowance = new BigNumber(allowance);
    console.debug("%s token %s allowance %s(%s->%s)", chainInfo.chainType, tokenSc, allowance.toFixed(), convert.fromAddr, chainInfo.crossScAddr);
    let approve0Title = this.uiStrService.getStrByName("approve0Title");
    let approve0Desc = this.uiStrService.getStrByName("approve0Desc");
    let approveValueTitle = this.uiStrService.getStrByName("approveValueTitle");
    let approveValueDesc = this.uiStrService.getStrByName("approveValueDesc");
    if (allowance.isGreaterThan(0)) {
      let value = new BigNumber(convert.value).multipliedBy(Math.pow(10, decimals));
      if (allowance.isLessThan(value)) {
        // approve 0
        let approve0Params = Object.assign({}, approveParams);
        approve0Params.value = new BigNumber(0);
        steps.push({name: "erc20Approve0", stepIndex: steps.length + 1, title: approve0Title, desc: approve0Desc, params: approve0Params});
        // approve
        steps.push({name: "erc20Approve", stepIndex: steps.length + 1, title: approveValueTitle, desc: approveValueDesc, params: approveParams});
      }
    } else {
      steps.push({name: "erc20Approve", stepIndex: steps.length + 1, title: approveValueTitle, desc: approveValueDesc, params: approveParams});
    }
  }

  async buildErc721Approve(steps, tokenPair, convert) {
    let chainInfo = (convert.convertType === "MINT")? tokenPair.fromScInfo : tokenPair.toScInfo;
    let tokenSc = (convert.convertType === "MINT")? tokenPair.fromAccount : tokenPair.toAccount;
    let value = convert.value; // tokenId
    let approved = await this.iWanConnectorService.checkErc721Approved(chainInfo.chainType, tokenSc, value, convert.fromAddr, chainInfo.crossScAddr);
    if (approved === false) {
      let params = {
        ccTaskId: convert.ccTaskId,
        fromAddr: convert.fromAddr,
        scChainType: chainInfo.chainType,
        tokenAddr: tokenSc,
        gasPrice: chainInfo.gasPrice,
        gasLimit: chainInfo.erc20ApproveGasLimit,
        value,
        operator: chainInfo.crossScAddr,
        taskType: "ProcessErc721Approve"
      }
      console.debug("TokenHandler buildErc721Approve params: %O", params);
      let approveValueTitle = this.uiStrService.getStrByName("approveValueTitle");
      let approveValueDesc = this.uiStrService.getStrByName("approveValueDesc");
      steps.push({name: "erc721Approve", stepIndex: steps.length + 1, title: approveValueTitle, desc: approveValueDesc, params});
    }
  }

  async buildUserFastMint(steps, tokenPair, convert) {
    let chainInfo = (convert.convertType === "MINT")? tokenPair.fromScInfo : tokenPair.toScInfo;
    let decimals = (convert.convertType === "MINT")? tokenPair.fromDecimals : tokenPair.toDecimals;
    let tokenAccount = (convert.convertType === "MINT")? tokenPair.fromAccount : tokenPair.toAccount;
    let toChainType = (convert.convertType === "MINT")? tokenPair.toChainType : tokenPair.fromChainType;
    let value = new BigNumber(convert.value).multipliedBy(Math.pow(10, decimals));
    let unit = tool.getCoinSymbol(chainInfo.chainType, chainInfo.chainName);
    let networkFee = tool.parseFee(convert.fee, convert.value, unit, chainInfo.chainDecimals, false);
    let operateFee = tool.parseFee(convert.fee, convert.value, tokenPair.ancestorSymbol, decimals, false);
    let params = {
      ccTaskId: convert.ccTaskId,
      fromAddr: convert.fromAddr,
      scChainType: chainInfo.chainType,
      crossScAddr: chainInfo.crossScAddr,
      gasPrice: chainInfo.gasPrice,
      gasLimit: chainInfo.erc20FastMintGasLimit,
      storemanGroupId: convert.storemanGroupId,
      tokenPairID: convert.tokenPairId,
      value,
      userAccount: tool.getStandardAddressInfo(toChainType, convert.toAddr).evm,
      toAddr: convert.toAddr, // for readability
      taskType: "ProcessErc20UserFastMint",
      fee: networkFee,
      tokenAccount,
      userBurnFee: operateFee
    };
    console.debug("TokenCommonHandle buildUserFastMint params: %O", params);
    let mintTitle = this.uiStrService.getStrByName("MintTitle");
    let mintDesc = this.uiStrService.getStrByName("MintDesc");
    steps.push({name: "userFastMint", stepIndex: steps.length + 1, title: mintTitle, desc: mintDesc, params});
  }

  async buildUserFastBurn(steps, tokenPair, convert) {
    let chainInfo = (convert.convertType === "MINT")? tokenPair.fromScInfo : tokenPair.toScInfo;
    let decimals = (convert.convertType === "MINT")? tokenPair.fromDecimals : tokenPair.toDecimals;
    let tokenAccount = (convert.convertType === "MINT")? tokenPair.fromAccount : tokenPair.toAccount;
    let toChainType = (convert.convertType === "MINT")? tokenPair.toChainType : tokenPair.fromChainType;
    let value = new BigNumber(convert.value).multipliedBy(Math.pow(10, decimals));
    let unit = tool.getCoinSymbol(chainInfo.chainType, chainInfo.chainName);
    let networkFee = tool.parseFee(convert.fee, convert.value, unit, chainInfo.chainDecimals, false);
    let operateFee = tool.parseFee(convert.fee, convert.value, tokenPair.ancestorSymbol, decimals, false);
    let params = {
      ccTaskId: convert.ccTaskId,
      fromAddr: convert.fromAddr,
      scChainType: chainInfo.chainType,
      crossScAddr: chainInfo.crossScAddr,
      gasPrice: chainInfo.gasPrice,
      gasLimit: chainInfo.erc20FastBurnGasLimit,
      storemanGroupId: convert.storemanGroupId,
      tokenPairID: convert.tokenPairId,
      value,
      userAccount: tool.getStandardAddressInfo(toChainType, convert.toAddr).evm,
      toAddr: convert.toAddr, // for readability
      taskType: "ProcessErc20UserFastBurn",
      fee: networkFee,
      tokenAccount,
      userBurnFee: operateFee
    };
    console.debug("TokenCommonHandle buildUserFastBurn params: %O", params);
    let burnTitle = this.uiStrService.getStrByName("BurnTitle");
    let burnDesc = this.uiStrService.getStrByName("BurnDesc");
    steps.push({name: "userFastBurn", stepIndex: steps.length + 1, title: burnTitle, desc: burnDesc, params});
  }

  async setChainId(steps, tokenPair, convert) {
    let chainId = await convert.wallet.getChainId();
    for (let i = 0; i < steps.length; i++) {
      steps[i].params.chainId = chainId;
    }
  }

  async checkGasFee(steps, tokenPair, convert) {
    let chainInfo = (convert.convertType === "MINT")? tokenPair.fromScInfo : tokenPair.toScInfo;
    let result = true;
    if (chainInfo.chainType !== "TRX") {
      let unit = tool.getCoinSymbol(chainInfo.chainType, chainInfo.chainName);
      let fee = tool.parseFee(convert.fee, convert.value, unit, chainInfo.chainDecimals, false);
      result = await this.utilService.checkBalanceGasFee(steps, chainInfo.chainType, convert.fromAddr, fee);
    }
    if (result) {
      this.webStores["crossChainTaskSteps"].setTaskSteps(convert.ccTaskId, steps);
      return {
        stepNum: steps.length,
        errCode: null
      };
    } else {
      console.error("TokenHandler task %d insufficient gas", convert.ccTaskId);
      this.webStores["crossChainTaskSteps"].setTaskSteps(convert.ccTaskId, []);
      return {
        stepNum: 0,
        errCode: this.globalConstant.ERR_INSUFFICIENT_GAS
      };
    }
  }
}