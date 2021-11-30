'use strict';

const Web3 = require("web3");
const BigNumber = require("bignumber.js");
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
    let protocol = tokenPair.protocol;
    if (protocol === "erc20") {
      return buildErc20Approve(steps, tokenPair, convert);
    } else if (protocol === "erc721") {
      return buildErc721Approve(steps, tokenPair, convert);
    }
  }

  async buildErc20Approve(steps, tokenPair, convert) {
    let chainInfo = (convert.convertType === "MINT")? tokenPair.fromScInfo : tokenPair.toScInfo;
    let tokenSc = (convert.convertType === "MINT")? tokenPair.fromAccount : tokenPair.toAccount;
    let approveMaxValue = new BigNumber(chainInfo.approveMaxValue);
    let approveParams = {
      ccTaskId: convert.ccTaskId,
      fromAddr: convert.fromAddr,
      scChainType: chainInfo.chainType,
      erc20Addr: tokenSc,
      erc20Abi: chainInfo.erc20AbiJson,
      gasPrice: chainInfo.gasPrice,
      gasLimit: chainInfo.erc20ApproveGasLimit,
      value: approveMaxValue,
      spenderAddr: chainInfo.crossScAddr,
      taskType: "ProcessErc20Approve",
      fee: new BigNumber(0)
    };
    console.debug("TokenHandler buildErc20Approve %s params: %O", convert.convertType, approveParams);
    let allowance = await this.iWanConnectorService.getErc20Allowance(chainInfo.chainType,
      tokenSc,
      convert.fromAddr,
      chainInfo.crossScAddr,
      chainInfo.erc20AbiJson);
    allowance = new BigNumber(allowance);
    let approve0Title = this.uiStrService.getStrByName("approve0Title");
    let approve0Desc = this.uiStrService.getStrByName("approve0Desc");
    let approveValueTitle = this.uiStrService.getStrByName("approveValueTitle");
    let approveValueDesc = this.uiStrService.getStrByName("approveValueDesc");
    if (allowance.isGreaterThan(0)) {
      let decimals = (convert.convertType === "MINT")? tokenPair.fromDecimals : tokenPair.toDecimals;
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
      let isOwner = await this.iWanConnectorService.checkErc721Ownership(chainInfo.chainType, tokenSc, value, convert.fromAddr, true);
      let params = {
        ccTaskId: convert.ccTaskId,
        fromAddr: convert.fromAddr,
        scChainType: chainInfo.chainType,
        tokenAddr: tokenSc,
        gasPrice: chainInfo.gasPrice,
        gasLimit: chainInfo.erc20ApproveGasLimit,
        value,
        operator: chainInfo.crossScAddr,
        taskType: "ProcessErc721Approve",
        fee: new BigNumber(0),
        isOwner
      };
      console.debug("TokenHandler buildErc721Approve params: %O", params);
      let approveValueTitle = this.uiStrService.getStrByName("approveValueTitle");
      let approveValueDesc = this.uiStrService.getStrByName("approveValueDesc");
      steps.push({name: "erc721Approve", stepIndex: steps.length + 1, title: approveValueTitle, desc: approveValueDesc, params});
    }
  }

  async buildUserFastMint(steps, tokenPair, convert, taskType) {
    let chainInfo = tokenPair.fromScInfo;
    let value = new BigNumber(convert.value).multipliedBy(Math.pow(10, tokenPair.fromDecimals));
    let params = {
      ccTaskId: convert.ccTaskId,
      fromAddr: convert.fromAddr,
      scChainType: chainInfo.chainType,
      crossScAddr: chainInfo.crossScAddr,
      crossScAbi: chainInfo.crossScAbiJson,
      gasPrice: chainInfo.gasPrice,
      gasLimit: chainInfo.erc20FastMintGasLimit,
      storemanGroupId: convert.storemanGroupId,
      tokenPairID: convert.tokenPairId,
      value,
      userAccount: convert.toAddr,
      taskType,
      fee: convert.fee.operateFee.rawValue,
      tokenAccount: tokenPair.fromAccount,
      userBurnFee: convert.fee.networkFee.rawValue
    };
    console.debug("TokenCommonHandle buildUserFastMint params: %O", params);
    let mintTitle = this.uiStrService.getStrByName("MintTitle");
    let mintDesc = this.uiStrService.getStrByName("MintDesc");
    steps.push({name: "userFastMint", stepIndex: steps.length + 1, title: mintTitle, desc: mintDesc, params});
  }

  async buildUserFastBurn(steps, tokenPair, convert, taskType) {
    let chainInfo = tokenPair.toScInfo;
    let value = new BigNumber(convert.value).multipliedBy(Math.pow(10, tokenPair.toDecimals));
    let params = {
      ccTaskId: convert.ccTaskId,
      fromAddr: convert.fromAddr,
      scChainType: chainInfo.chainType,
      crossScAddr: chainInfo.crossScAddr,
      crossScAbi: chainInfo.crossScAbiJson,
      gasPrice: chainInfo.gasPrice,
      gasLimit: chainInfo.erc20FastBurnGasLimit,
      storemanGroupId: convert.storemanGroupId,
      tokenPairID: convert.tokenPairId,
      value,
      userAccount: convert.toAddr,
      taskType,
      fee: convert.fee.operateFee.rawValue,
      tokenAccount: tokenPair.toAccount,
      userBurnFee: convert.fee.networkFee.rawValue
    };
    let isEvmAddr = /^0x[0-9a-fA-F]{40}$/.test(convert.toAddr);
    if (isEvmAddr) {
      params.userAccount = convert.toAddr;
    } else {
      params.toAddr = convert.toAddr;
      params.userAccount = web3.utils.asciiToHex(convert.toAddr);
    }
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
    console.log("checkGasFee: %O", {steps, chainType: chainInfo.chainType, fromAddr: convert.fromAddr, fee: convert.fee.operateFee.rawValue})
    let result = await this.utilService.checkBalanceGasFee(steps, chainInfo.chainType, convert.fromAddr, convert.fee.operateFee.rawValue);
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