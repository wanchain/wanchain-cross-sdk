import TokenHandler from "./tokenHandler.js";

class MintErc20Handle extends TokenHandler { // includes ERC20 & ERC721
  constructor(frameworkService) {
    super(frameworkService);
  }

  async process(tokenPair, convert) {
    let steps = [];
    await this.buildApproveSteps(steps, tokenPair, convert);
    await this.buildUserFastMint(steps, tokenPair, convert);
    //console.debug("MintErc20Handle steps: %O", steps);
    return steps;
  }
}

export default MintErc20Handle;
