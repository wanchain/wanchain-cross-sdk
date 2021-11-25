'use strict';

module.exports = class BurnOtherCoinToAncestorChain {
  constructor(frameworkService) {
    super(frameworkService);
  }

  async process(tokenPair, convert) {
    let steps = [];
    await this.buildApproveSteps(steps, tokenPair, convert);
    await this.buildUserFastBurn(steps, tokenPair, convert, "ProcessBurnOtherCoinToAncestorChain");
    await this.setChainId(steps, tokenPair, convert);
    //console.log("BurnErc20Handle steps: %O", steps);
    let result = await this.checkGasFee(steps, tokenPair, convert);
    return result;
}