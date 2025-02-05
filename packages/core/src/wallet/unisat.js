
class UniSatWallet {
  constructor(provider) {
    if (window.unisat) {
      this.name = "Unisat";
      if (!['mainnet', 'testnet'].includes(provider)) {
        throw new Error("Invalid provider, should be 'mainnet' or 'testnet'");
      }
      this.wallet = window.unisat;
    } else {
      window.open('https://chromewebstore.google.com/detail/unisat-wallet/ppbibelpcjmhbdihakflkdcoccbgbkpo');
      throw new Error('please install Unisat wallet');
    }
  }

  // standard function

  async getChainId() {
    const chainId = await this.wallet.getChain();
    return chainId;
  }

  async getAccounts(network) {
    try {
      let accounts = await this.wallet.getAccounts();
      return accounts;
    } catch (err) {
      console.error("%s not installed or not allowed: %O", this.name, err);
      throw new Error("Not installed or not allowed");
    }
  }

  async getBalance() {
    try {
      const res = await this.wallet.getBalance();
      return res.confirmed;
    } catch (e) {
      console.error(e);
      throw new Error("Not used address");
    }
  }

  async sendTransaction(toAddr, satoshis, opt) {
    try {
      let txid = await this.wallet.sendBitcoin(toAddr, satoshis, opt);
      return txid;
    } catch (e) {
      console.log(e);
    }
  }
}

module.exports = UniSatWallet;