'use strict';

let BigNumber = require("bignumber.js");

const TokenBaseHandle = require("./tokenBaseHandle.js");

module.exports = class BurnErc20Handle extends TokenBaseHandle {
  constructor(frameworkService) {
    super(frameworkService);
  }

  async process(tokenPair, convert) {
    let steps = [];
    await this.buildApproveSteps(steps, tokenPair, convert);
    await this.buildUserFastBurn(steps, tokenPair, convert);
    await this.setChainId(steps, tokenPair, convert);
    //console.log("BurnErc20Handle steps: %O", steps);
    let result = await this.checkGasFee(steps, tokenPair, convert);
    return result;
  }
}