class Lace {
  constructor() {
    this.name = "Midnight Lace";
    this.wallet = window.midnight.mnLace;
  }

  // standard function

  async getChainId() {
    return 0;
  }

  async getAccounts() {
    try {
      let wallet = await this.wallet.enable();
      let state = await wallet.state();
      console.log(state);
      return [state.address];
    } catch (err) {
      console.error("%s not installed or not enabled: %O", this.name, err);
      throw new Error("Not installed or not enabled");
    }
  }

  // do not support getBalance for privacy
  async getBalance(addr, tokenId) {
    return "0";
  }

  // wrap wallet

  async getWallet() {
    let wallet = await this.wallet.enable();
    return wallet;
  }
}

module.exports = Lace;