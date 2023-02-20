'use strict';

const TokenHandler = require("./tokenHandler.js");

module.exports = class MintErc20Handle extends TokenHandler { // includes ERC20 & ERC721
  constructor(frameworkService) {
    super(frameworkService);
  }

  async process(tokenPair, convert) {
    let steps = [];
    await this.buildApproveSteps(steps, tokenPair, convert);
    await this.buildUserFastMint(steps, tokenPair, convert);
    await this.setChainId(steps, tokenPair, convert);
    //console.log("MintErc20Handle steps: %O", steps);
    let result = await this.checkGasFee(steps, tokenPair, convert);
    return result;
  }
}