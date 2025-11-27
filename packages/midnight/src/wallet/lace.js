class Lace {
  constructor() {
    this.name = "Midnight Lace";
  }

  // standard function

  async getChainId() {
    return 0;
  }

  async getAccounts() {
    try {
      let wallet = await window.midnight.mnLace.enable();
      let state = await wallet.state();
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

  async getWallet() { // wrap wallet
    let wallet = await window.midnight.mnLace.enable();
    return wallet;
  }

  async sendTransaction(tx) {
    let wallet = await window.midnight.mnLace.enable();
    let provedTx = await wallet.balanceAndProveTransaction(tx, []);
    console.log("proved tx: %O", provedTx);
    let txHash = await wallet.submitTransaction(provedTx);
    console.log("txHash: %s", txHash);
  }
}

export default Lace;
