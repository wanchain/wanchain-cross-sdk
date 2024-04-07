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
    let direction = (convert.convertType === "MINT");
    let chainInfo = direction? tokenPair.fromScInfo : tokenPair.toScInfo;
    let decimals = direction? tokenPair.fromDecimals : tokenPair.toDecimals;
    let tokenAccount = direction? tokenPair.fromAccount : tokenPair.toAccount;
    let toChainType = direction? tokenPair.toChainType : tokenPair.fromChainType;
    let value = new BigNumber(convert.value).multipliedBy(Math.pow(10, decimals));
    let unit = this.chainInfoService.getCoinSymbol(chainInfo.chainType);
    let networkFee = tool.parseFee(convert.fee, convert.value, unit, {formatWithDecimals: false});
    let operateFee = tool.parseFee(convert.fee, convert.value, tokenPair.readableSymbol, {formatWithDecimals: false});
    let innerToAddr = convert.toAddr;
    if (toChainType === "SOL") {
      let sol = this.configService.getExtension(toChainType);
      let toAccount = tool.ascii2letter(direction? tokenPair.toAccount : tokenPair.fromAccount);
      innerToAddr = sol.tool.getAssociatedTokenAddressSync(sol.tool.getPublicKey(toAccount), sol.tool.getPublicKey(convert.toAddr)).toString();
      console.log({innerToAddr});
    }
    let toAddressInfo = tool.getStandardAddressInfo(toChainType, innerToAddr, this.configService.getExtension(toChainType));
    let params = {
      ccTaskId: convert.ccTaskId,
      fromAddr: convert.fromAddr,
      scChainType: chainInfo.chainType,
      crossScAddr: tokenPair.bridge? chainInfo[tokenPair.bridge + "Bridge"].crossScAddr : chainInfo.crossScAddr,
      tokenPairID: convert.tokenPairId,
      value,
      userAccount: toAddressInfo.cctp || toAddressInfo.evm,
      toAddr: convert.toAddr, // for readability
      innerToAddr, // for cctp to solana
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