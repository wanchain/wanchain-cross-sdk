
class UniSatWallet {
  constructor(provider) {
    if (window.unisat) {
      this.name = "Unisat";
      if (!['mainnet', 'testnet'].includes(provider)) {
        throw new Error("Invalid provider, should be 'mainnet' or 'testnet'");
      }
      this.wallet = window.unisat;
    } else {
      // window.open('https://eternl.io');
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
      message.error("Not installed or not allowed");
      throw new Error("Not installed or not allowed");
    }
  }

  async getBalance() {
    try {
      const res = await this.wallet.getBalance();
      console.log('btc balance', res);
      return res.confirmed;
    } catch (e) {
      console.error(e);
      message.error("Not used address");
      throw new Error("Not used address");
    }
  }

  async sendTransaction(tx) {
    try {
      let txid = await this.wallet.sendBitcoin(toAddr, satoshis, opt);
      console.log(txid)
      return txid;
    } catch (e) {
      console.log(e);
    }
  }
}

module.exports = UniSatWallet;