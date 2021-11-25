'use strict';

let BigNumber = require("bignumber.js");


module.exports = class MintOtherCoinBetweenEthWanHandle {
  constructor(frameworkService) {
    super(frameworkService);
  }

  async process(tokenPair, convert) {
    let steps = [];
    await this.buildApproveSteps(steps, tokenPair, convert);
    await this.buildUserFastMint(steps, tokenPair, convert, "ProcessMintOtherCoinBetweenEthWan");
    await this.setChainId(steps, tokenPair, convert);
    //console.log("MintErc20Handle steps: %O", steps);
    let result = await this.checkGasFee(steps, tokenPair, convert);
    return result;
};