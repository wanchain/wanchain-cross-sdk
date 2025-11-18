
class UniSatWallet {
  constructor(provider) {
    if (window.unisat) {
      this.name = "Unisat";
      if (!['mainnet', 'testnet'].includes(provider.network)) {
        throw new Error("Invalid provider, should be 'mainnet' or 'testnet'");
      }
      this.wallet = window.unisat;
    } else {
      window.open('https://chromewebstore.google.com/detail/unisat-wallet/ppbibelpcjmhbdihakflkdcoccbgbkpo');
      throw new Error('please install Unisat wallet');
    }
  }

  async connect() {
    try {
      let accounts = await this.wallet.requestAccounts();
      if (!accounts.length) {
        throw new Error("Not installed or not allowed");
      }
      return accounts;
    } catch (err) {
      console.error("%s not installed or not allowed: %O", this.name, err);
      throw new Error("Not installed or not allowed");
    }
  }

  disconnect() {
    this.wallet.disconnect();
  }

  // standard function

  async getChainId() {
    const chainId = await this.wallet.getChain();
    const { name, network } = chainId;
    if (name === 'Bitcoin' && network === 'livenet') {
      return 'bitcoin';
    } else if (name === 'Bitcoin Testnet' && network === 'testnet') {
      return 'testnet';
    } else {
      return 'unknown';
    }

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
      return res.total;
    } catch (e) {
      console.error(e);
      throw new Error("Not used address");
    }
  }

  async sendTransaction(toAddr, satoshis, opt) {
    try {
      let txid = await this.wallet.sendBitcoin(toAddr, Number(satoshis), opt);
      return txid;
    } catch (e) {
      console.log(e);
    }
  }

  on(...arg) {
    this.wallet.on(...arg);
  }

  off(...arg) {
    this.wallet.off(...arg);
  }
}

module.exports = UniSatWallet;