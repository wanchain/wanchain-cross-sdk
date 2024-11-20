class SuiWallet {
  constructor() {
    this.name = "SuiWallet";
    this.wallet = null;
    let detail = {
      register: (wallet) => {
        this.wallet = wallet;
        console.debug("got SuiWallet")
      }
    }
    window.dispatchEvent(new CustomEvent('wallet-standard:app-ready', {detail}));    
  }

  // standard function

  async checkWallet() {
    if (!this.wallet) {
      throw new Error("Not installed or not ready");
    }
    if (this.wallet.accounts.length === 0) {
      try {
        await this.wallet.features['standard:connect'].connect();
      } catch (err) {
        throw new Error("Not connected");
      }
    }
  }

  async getChainId() {
    await this.checkWallet();
    return this.wallet.chains[0];
  }

  async getAccounts() {
    await this.checkWallet();
    return [this.wallet.accounts[0].address];
  }

  async getBalance(address, tokenAccount = "") {
    throw new Error("Not support getBalance");
  }

  async sendTransaction(tx) {
    let result = await this.wallet.features['sui:signTransaction'].signTransaction({
      transaction: tx,
      // options: { showEffects: true },
    })
    console.log("sendTransaction result: %O", result);
  }

  // customized function
}

module.exports = SuiWallet;