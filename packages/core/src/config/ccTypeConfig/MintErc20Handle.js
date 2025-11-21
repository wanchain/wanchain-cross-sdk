import TokenHandler from "./tokenHandler.js";
'use strict';
export default (class MintErc20Handle extends TokenHandler {
  constructor(frameworkService) {
    super(frameworkService);
  }
  async process(tokenPair, convert) {
    let steps = [];
    await this.buildApproveSteps(steps, tokenPair, convert);
    await this.buildUserFastMint(steps, tokenPair, convert);
    await this.setChainId(steps, tokenPair, convert);
    //console.debug("MintErc20Handle steps: %O", steps);
    return steps;
  }
});
