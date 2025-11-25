class OkxBitcoinWallet {
  constructor(network, cb) {
    if (window.okxwallet?.bitcoin) {
      this.name = "okxBitcoin";
      if (!['mainnet', 'testnet'].includes(network)) {
        throw new Error("Invalid network, should be 'mainnet' or 'testnet'");
      }
      if (network === 'mainnet') {
        this.wallet = window.okxwallet.bitcoin;
      } else {
        this.wallet = window.okxwallet.bitcoinTestnet;
      }
      this.setAccount = cb;
      this.network = network;
    } else {
      window.open('https://chromewebstore.google.com/detail/okx-wallet/mcohilncbfahbmgdjkbpemcciiolgcge');
      throw new Error('please install Okx Bitcoin wallet');
    }
  }
  async connect() {
    try {
      let wallet = await this.wallet.connect();
      if (!wallet.address) {
        throw new Error("Not installed or not allowed");
      }
      return [wallet.address];
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
    const chainId = await this.wallet.getNetwork();
    if (chainId === 'livenet') {
      return 'bitcoin';
    } else if (chainId === 'testnet') {
      return chainId;
    } else {
      return 'unknown';
    }
  }

  async getAccounts(network) {
    try {
      let accounts = await this.wallet.getAccounts();
      if (this.network === 'mainnet') {
        accounts = await this.wallet.getAccounts();
      } else {
        accounts = await this.wallet.getSelectedAccount();
        accounts = [accounts.address];
      }
      return accounts;
    } catch (err) {
      console.error("%s not installed or not allowed: %O", this.name, err);
      throw new Error("Not installed or not allowed");
    }
  }

  async accountsChanged(addrs) {
    let accounts;
    if (this.network === 'mainnet') {
      accounts = addrs;
    } else {
      const wallet = window.okxwallet.bitcoinTestnet;
      accounts = await wallet.connect();
      accounts = [accounts.address];
    }
    await this.setAccount(accounts);
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

  on() {
    window.okxwallet?.bitcoin.on('accountsChanged', this.accountsChanged.bind(this));
  }

  off() {
    window.okxwallet?.bitcoin.off('accountsChanged', this.accountsChanged.bind(this));
  }

  async accountsChanged(addrs) {
    let accounts;
    if (this.network === 'mainnet') {
      accounts = addrs;
    } else {
      const wallet = window.okxwallet.bitcoinTestnet;
      accounts = await wallet.connect();
      accounts = [accounts.address];
    }
    await this.setAccount(accounts);
  }

  async sendTransaction(toAddr, satoshis, opt) {
    try {
      // let txid = await this.wallet.sendBitcoin(toAddr, satoshis, opt);
      // return txid;
      const { decimals, fromAddr, memo } = opt;
      const value = new BigNumber(satoshis).dividedBy(Math.pow(10, decimals)).toFixed();
      let txid = await this.wallet.send({
        from: fromAddr,
        to: toAddr,
        value,
        memo: memo,
        memoPos: 3
      });
      return txid.txhash;
    } catch (e) {
      console.error(e);
    }
  }
}

export default OkxBitcoinWallet;
