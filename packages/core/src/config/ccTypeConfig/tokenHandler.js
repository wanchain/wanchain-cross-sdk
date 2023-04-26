'use strict';

const BigNumber = require("bignumber.js");
const tool = require('../../utils/tool.js');
const CCTypeHandleInterface = require("./CCTypeHandleInterface.js");

module.exports = class TokenHandler extends CCTypeHandleInterface { // ERC20 & ERC721
  constructor(frameworkService) {
    super();
    this.frameworkService = frameworkService;
    this.iWanConnectorService = frameworkService.getService("iWanConnectorService");
    this.utilService = frameworkService.getService("UtilService");
    this.uiStrService = frameworkService.getService("UIStrService");
    this.globalConstant = frameworkService.getService("GlobalConstant");
    this.configService = frameworkService.getService("ConfigService");
  }

  async process(tokenPair, convert) {  
    console.error("Unimplemented interface");
    return {
      stepNum: 0,
      errCode: this.globalConstant.ERR_OTHER_UNKNOWN_ERR
    };
  }

  async buildApproveSteps(steps, tokenPair, convert) {
    if (["Erc721", "Erc1155"].includes(tokenPair.protocol)) {
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
    let crossScAddr = tokenPair.bridge? chainInfo[tokenPair.bridge + "Bridge"].crossScAddr : chainInfo.crossScAddr;
    let approveParams = {
      ccTaskId: convert.ccTaskId,
      fromAddr: convert.fromAddr,
      scChainType: chainInfo.chainType,
      erc20Addr: tokenSc,
      gasPrice: chainInfo.gasPrice,
      gasLimit: chainInfo.approveGasLimit,
      value: approveMaxValue,
      spenderAddr: crossScAddr,
      taskType: "ProcessErc20Approve"
    };
    console.debug("TokenHandler buildErc20Approve %s params: %O", convert.convertType, approveParams);
    let allowance = await this.iWanConnectorService.getErc20Allowance(chainInfo.chainType,
      tokenSc,
      convert.fromAddr,
      crossScAddr);
    allowance = new BigNumber(allowance);
    console.debug("%s token %s allowance %s(%s->%s)", chainInfo.chainType, tokenSc, allowance.toFixed(), convert.fromAddr, crossScAddr);
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
    let value = convert.value; // [tokenId, name] or [{tokenId, name, amount}]
    let approved = await this.iWanConnectorService.checkErc721Approved(chainInfo.chainType, tokenSc, value, convert.fromAddr, chainInfo.crossScAddr);
    if (approved === false) {
      let params = {
        ccTaskId: convert.ccTaskId,
        fromAddr: convert.fromAddr,
        scChainType: chainInfo.chainType,
        tokenAddr: tokenSc,
        gasPrice: chainInfo.gasPrice,
        gasLimit: chainInfo.approveGasLimit,
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
    let tokenType = tokenPair.protocol;
    let value = (tokenType === "Erc20")? new BigNumber(convert.value).multipliedBy(Math.pow(10, decimals)) : convert.value;
    let unit = tool.getCoinSymbol(chainInfo.chainType, chainInfo.chainName);
    let networkFee = tool.parseFee(convert.fee, convert.value, unit, {formatWithDecimals: false});
    let operateFee = tool.parseFee(convert.fee, convert.value, tokenPair.readableSymbol, {formatWithDecimals: false});
    let params = {
      ccTaskId: convert.ccTaskId,
      fromAddr: convert.fromAddr,
      scChainType: chainInfo.chainType,
      crossScAddr: chainInfo.crossScAddr,
      gasPrice: chainInfo.gasPrice,
      gasLimit: this.getCrossTxGasLimit(chainInfo, tokenType, value),
      storemanGroupId: convert.storemanGroupId,
      tokenPairID: convert.tokenPairId,
      value,
      userAccount: tool.getStandardAddressInfo(toChainType, convert.toAddr, this.configService.getExtension(toChainType)).evm,
      toAddr: convert.toAddr, // for readability
      taskType: "ProcessErc20UserFastMint",
      fee: networkFee,
      tokenAccount,
      userBurnFee: operateFee,
      tokenType
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
    let tokenType = tokenPair.protocol;
    let value = (tokenType === "Erc20")? new BigNumber(convert.value).multipliedBy(Math.pow(10, decimals)) : convert.value;
    let unit = tool.getCoinSymbol(chainInfo.chainType, chainInfo.chainName);
    let networkFee = tool.parseFee(convert.fee, convert.value, unit, {formatWithDecimals: false});
    let operateFee = tool.parseFee(convert.fee, convert.value, tokenPair.readableSymbol, {formatWithDecimals: false});
    let params = {
      ccTaskId: convert.ccTaskId,
      fromAddr: convert.fromAddr,
      scChainType: chainInfo.chainType,
      crossScAddr: chainInfo.crossScAddr,
      gasPrice: chainInfo.gasPrice,
      gasLimit: this.getCrossTxGasLimit(chainInfo, tokenType, value),
      storemanGroupId: convert.storemanGroupId,
      tokenPairID: convert.tokenPairId,
      value,
      userAccount: tool.getStandardAddressInfo(toChainType, convert.toAddr, this.configService.getExtension(toChainType)).evm,
      toAddr: convert.toAddr, // for readability
      taskType: "ProcessErc20UserFastBurn",
      fee: networkFee,
      tokenAccount,
      userBurnFee: operateFee,
      tokenType
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
      let fee = tool.parseFee(convert.fee, convert.value, unit, {formatWithDecimals: false});
      result = await this.utilService.checkBalanceGasFee(steps, chainInfo.chainType, convert.fromAddr, fee);
    }
    if (result) {
      return steps;
    } else {
      console.error("TokenHandler task %d insufficient gas", convert.ccTaskId);
      throw new Error(this.globalConstant.ERR_INSUFFICIENT_GAS);
    }
  }

  getCrossTxGasLimit(chainInfo, tokenType, value) {
    let gasLimit = chainInfo.crossGasLimit;
    if ((tokenType !== "Erc20") && (value.length > 1)) {
      gasLimit = gasLimit + gasLimit * 0.2 * (value.length - 1);
    }
    return parseInt(gasLimit);
  }
}