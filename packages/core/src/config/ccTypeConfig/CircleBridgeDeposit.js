'use strict';

const BigNumber = require("bignumber.js");
const tool = require('../../utils/tool.js');
const TokenHandler = require("./tokenHandler.js");

module.exports = class CircleBridgeDeposit extends TokenHandler {
  constructor(frameworkService) {
    super(frameworkService);
  }

  async process(tokenPair, convert) {
    let steps = [];
    await this.buildApproveSteps(steps, tokenPair, convert);
    await this.buildDeposit(steps, tokenPair, convert);
    await this.setChainId(steps, tokenPair, convert);
    //console.log("CircleBridgeDeposit steps: %O", steps);
    return steps;
  }

  async buildDeposit(steps, tokenPair, convert) {
    let chainInfo = (convert.convertType === "MINT")? tokenPair.fromScInfo : tokenPair.toScInfo;
    let decimals = (convert.convertType === "MINT")? tokenPair.fromDecimals : tokenPair.toDecimals;
    let tokenAccount = (convert.convertType === "MINT")? tokenPair.fromAccount : tokenPair.toAccount;
    let toChainType = (convert.convertType === "MINT")? tokenPair.toChainType : tokenPair.fromChainType;
    let value = new BigNumber(convert.value).multipliedBy(Math.pow(10, decimals));
    let unit = tool.getCoinSymbol(chainInfo.chainType, chainInfo.chainName);
    let networkFee = tool.parseFee(convert.fee, convert.value, unit, {formatWithDecimals: false});
    let operateFee = tool.parseFee(convert.fee, convert.value, tokenPair.readableSymbol, {formatWithDecimals: false});
    let params = {
      ccTaskId: convert.ccTaskId,
      fromAddr: convert.fromAddr,
      scChainType: chainInfo.chainType,
      crossScAddr: tokenPair.bridge? chainInfo[tokenPair.bridge + "Bridge"].crossScAddr : chainInfo.crossScAddr,
      tokenPairID: convert.tokenPairId,
      value,
      userAccount: tool.getStandardAddressInfo(toChainType, convert.toAddr, this.configService.getExtension(toChainType)).evm,
      toAddr: convert.toAddr, // for readability
      taskType: "ProcessCircleBridgeDeposit",
      networkFee,
      tokenAccount,
      operateFee
    };
    console.debug("CircleBridgeDeposit buildDeposit params: %O", params);
    let burnTitle = this.uiStrService.getStrByName("BurnTitle");
    let burnDesc = this.uiStrService.getStrByName("BurnDesc");
    steps.push({name: "depositForBurn", stepIndex: steps.length + 1, title: burnTitle, desc: burnDesc, params});
  }
}