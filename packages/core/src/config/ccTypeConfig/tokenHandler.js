import BigNumber from "bignumber.js";
import tool from "../../utils/tool.js";
import CCTypeHandleInterface from "./CCTypeHandleInterface.js";

export default (class TokenHandler extends CCTypeHandleInterface {
  constructor(frameworkService) {
    super();
    this.frameworkService = frameworkService;
    this.iWanConnectorService = frameworkService.getService("iWanConnectorService");
    this.configService = frameworkService.getService("ConfigService");
    this.chainInfoService = frameworkService.getService("ChainInfoService");
  }

  async process(tokenPair, convert) {
    console.error("Unimplemented interface");
    return {
      stepNum: 0,
      errCode: "Unknown error"
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
    let chainInfo = (convert.convertType === "MINT") ? tokenPair.fromScInfo : tokenPair.toScInfo;
    let tokenSc = (convert.convertType === "MINT") ? tokenPair.fromAccount : tokenPair.toAccount;
    let decimals = (convert.convertType === "MINT") ? tokenPair.fromDecimals : tokenPair.toDecimals;
    let approveMaxValue = "115792089237316195423570985008687907853269984665640564039457584007913129639935"; // max;
    let crossScAddr = "";
    if (tokenPair.bridge === "Circle") {
      let bridgeInfo = chainInfo[tokenPair.bridge + "Bridge"];
      crossScAddr = (convert.route === "CCTPV2") ? bridgeInfo.crossScAddrV2 : bridgeInfo.crossScAddr;
    } else {
      crossScAddr = convert.fee.networkFee.isSubsidy ? chainInfo.subsidyCrossSc : chainInfo.crossScAddr;
    }
    let approveParams = {
      ccTaskId: convert.ccTaskId,
      fromAddr: convert.fromAddr,
      scChainType: chainInfo.chainType,
      erc20Addr: tokenSc,
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
    if (allowance.isGreaterThan(0)) {
      let value = new BigNumber(convert.value).multipliedBy(Math.pow(10, decimals));
      if (allowance.isLessThan(value)) {
        // approve 0
        if (!["VET"].includes(chainInfo.chainType)) { // some chains erc20 implement do not need approve 0
          let approve0Params = Object.assign({}, approveParams);
          approve0Params.value = new BigNumber(0);
          steps.push({ name: "erc20Approve0", stepIndex: steps.length + 1, params: approve0Params });
        }
        // approve
        steps.push({ name: "erc20Approve", stepIndex: steps.length + 1, params: approveParams });
      }
    } else {
      steps.push({ name: "erc20Approve", stepIndex: steps.length + 1, params: approveParams });
    }
  }

  async buildErc721Approve(steps, tokenPair, convert) {
    let chainInfo = (convert.convertType === "MINT") ? tokenPair.fromScInfo : tokenPair.toScInfo;
    let tokenSc = (convert.convertType === "MINT") ? tokenPair.fromAccount : tokenPair.toAccount;
    let value = convert.value; // [tokenId, name] or [{tokenId, name, amount}]
    let crossScAddr = convert.fee.networkFee.isSubsidy ? chainInfo.subsidyCrossSc : chainInfo.crossScAddr;
    let approved = await this.iWanConnectorService.checkErc721Approved(chainInfo.chainType, tokenSc, value, convert.fromAddr, crossScAddr);
    if (approved === false) {
      let params = {
        ccTaskId: convert.ccTaskId,
        fromAddr: convert.fromAddr,
        scChainType: chainInfo.chainType,
        tokenAddr: tokenSc,
        value,
        operator: crossScAddr,
        taskType: "ProcessErc721Approve"
      };
      console.debug("TokenHandler buildErc721Approve params: %O", params);
      steps.push({ name: "erc721Approve", stepIndex: steps.length + 1, params });
    }
  }

  async buildUserFastMint(steps, tokenPair, convert) {
    let chainInfo = (convert.convertType === "MINT") ? tokenPair.fromScInfo : tokenPair.toScInfo;
    let decimals = (convert.convertType === "MINT") ? tokenPair.fromDecimals : tokenPair.toDecimals;
    let tokenAccount = (convert.convertType === "MINT") ? tokenPair.fromAccount : tokenPair.toAccount;
    let toChainType = (convert.convertType === "MINT") ? tokenPair.toChainType : tokenPair.fromChainType;
    let tokenType = tokenPair.protocol;
    let value = (tokenType === "Erc20") ? new BigNumber(convert.value).multipliedBy(Math.pow(10, decimals)).toFixed(0) : convert.value;
    let unit = this.chainInfoService.getCoinSymbol(chainInfo.chainType);
    let networkFee = tool.parseFee(convert.fee, convert.value, unit, { formatWithDecimals: false });
    let operateFee = tool.parseFee(convert.fee, convert.value, tokenPair.readableSymbol, { formatWithDecimals: false });
    let crossScAddr = convert.fee.networkFee.isSubsidy ? chainInfo.subsidyCrossSc : chainInfo.crossScAddr;
    let params = {
      ccTaskId: convert.ccTaskId,
      fromAddr: convert.fromAddr,
      scChainType: chainInfo.chainType,
      crossScAddr,
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
    steps.push({ name: "userFastMint", stepIndex: steps.length + 1, params });
  }

  async buildUserFastBurn(steps, tokenPair, convert) {
    let chainInfo = (convert.convertType === "MINT") ? tokenPair.fromScInfo : tokenPair.toScInfo;
    let decimals = (convert.convertType === "MINT") ? tokenPair.fromDecimals : tokenPair.toDecimals;
    let tokenAccount = (convert.convertType === "MINT") ? tokenPair.fromAccount : tokenPair.toAccount;
    let toChainType = (convert.convertType === "MINT") ? tokenPair.toChainType : tokenPair.fromChainType;
    let tokenType = tokenPair.protocol;
    let value = (tokenType === "Erc20") ? new BigNumber(convert.value).multipliedBy(Math.pow(10, decimals)).toFixed(0) : convert.value;
    let unit = this.chainInfoService.getCoinSymbol(chainInfo.chainType);
    let networkFee = tool.parseFee(convert.fee, convert.value, unit, { formatWithDecimals: false });
    let operateFee = tool.parseFee(convert.fee, convert.value, tokenPair.readableSymbol, { formatWithDecimals: false });
    let crossScAddr = convert.fee.networkFee.isSubsidy ? chainInfo.subsidyCrossSc : chainInfo.crossScAddr;
    let params = {
      ccTaskId: convert.ccTaskId,
      fromAddr: convert.fromAddr,
      scChainType: chainInfo.chainType,
      crossScAddr,
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
    steps.push({ name: "userFastBurn", stepIndex: steps.length + 1, params });
  }

  async setChainId(steps, tokenPair, convert) {
    let chainId = await convert.wallet.getChainId();
    for (let i = 0; i < steps.length; i++) {
      steps[i].params.chainId = chainId;
    }
  }
});
