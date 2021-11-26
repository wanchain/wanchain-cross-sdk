'use strict';

const TokenHandler = require("./tokenHandler.js");

// other chain coin or token cross between two evm chains

module.exports = class BurnOtherCoinBetweenEthWanHandle extends TokenHandler {
  constructor(frameworkService) {
    super(frameworkService);
  }

  async process(tokenPair, convert) {
    let steps = [];
    await this.buildApproveSteps(steps, tokenPair, convert);
    await this.buildUserFastBurn(steps, tokenPair, convert, "ProcessBurnOtherCoinBetweenEthWan");
    await this.setChainId(steps, tokenPair, convert);
    //console.log("BurnOtherCoinBetweenEthWanHandle steps: %O", steps);
    let result = await this.checkGasFee(steps, tokenPair, convert);
    return result;
  }
}