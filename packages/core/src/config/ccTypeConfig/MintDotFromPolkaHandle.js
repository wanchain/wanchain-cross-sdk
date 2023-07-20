'use strict';

const BigNumber = require("bignumber.js");
const tool = require("../../utils/tool.js");

const TaskTypes = {
  DOT: "ProcessDotMintFromPolka",
  PHA: "ProcessPhaMintFromPhala"
};

module.exports = class MintDotFromPolkaHandle {
  constructor(frameworkService) {
    this.frameworkService = frameworkService;
    this.configService = frameworkService.getService("ConfigService");
  }

  async process(tokenPair, convert) {
    try {
      let value = new BigNumber(convert.value).multipliedBy(Math.pow(10, tokenPair.fromDecimals)).toFixed();
      let fee = tool.parseFee(convert.fee, convert.value, tokenPair.ancestorSymbol, {formatWithDecimals: false});
      let toChainType = tokenPair.toChainType;
      let params = {
        ccTaskId: convert.ccTaskId,
        toChainType,
        userAccount: tool.getStandardAddressInfo(toChainType, convert.toAddr, this.configService.getExtension(toChainType)).ascii,
        toAddr: convert.toAddr, // for readability
        storemanGroupId: convert.storemanGroupId,
        storemanGroupGpk: convert.gpkInfo.gpk,
        tokenPairID: convert.tokenPairId,
        value,
        taskType: TaskTypes[tokenPair.fromChainType],
        fee,
        fromAddr: convert.fromAddr,
        fromChainID: tokenPair.fromChainID, // for Phala
        toChainID: tokenPair.toChainID      // for Phala
      };
      console.debug("MintDotFromPolkaHandle params: %O", params);
      let steps = [
        {name: "userFastMint", stepIndex: 1, title: "MintTitle", desc: "MintDesc", params}
      ];
      return steps;
    } catch (err) {
      console.error("MintDotFromPolkaHandle error: %O", err);
      throw err;
    }
  }
};