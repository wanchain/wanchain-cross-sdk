'use strict';

const TokenHandler = require("./tokenHandler.js");

module.exports = class BurnErc20Handle extends TokenHandler {
  constructor(frameworkService) {
    super(frameworkService);
  }

  async process(tokenPair, convert) {
    let steps = [];
    await this.buildApproveSteps(steps, tokenPair, convert);
    await this.buildUserFastBurn(steps, tokenPair, convert);
    await this.setChainId(steps, tokenPair, convert);
    //console.log("BurnErc20Handle steps: %O", steps);
    return steps;
  }
}