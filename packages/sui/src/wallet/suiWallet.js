class SuiWallet {
  constructor() {
    this.name = "SuiWallet";
    this.wallet = null;
    let detail = {
      register: (wallet) => {
        if (wallet.chains && wallet.chains.includes('sui:localnet')) {
          this.wallet = wallet;
        }
        console.debug("got SuiWallet", wallet);
      }
    };
    this.chainId = null;
    window.dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail }));
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
        console.error('Not connected', err);
        throw new Error("Not connected");
      }
    }
  }

  async getChainId() {
    await this.checkWallet();
    if (!this.chainId) {
      this.chainId = this.wallet.accounts[0]?.chains[0];
    }
    return this.chainId;
  }

  async getAccounts() {
    await this.checkWallet();
    const accounts = this.wallet.accounts.map(v => v.address);
    return accounts;
  }

  async getBalance(address, tokenAccount = "") {
    throw new Error("Not support getBalance");
  }

  async sendTransaction(tx, sender) {
    let { digest } = await this.wallet.features['sui:signAndExecuteTransaction'].signAndExecuteTransaction({
      transaction: tx,
      options: {
        showEffects: true,
        showEvents: true,
        showInput: true,
      },
      chain: this.chainId,
      account: { address: sender }
    });
    return digest;
  }

  on(name, cb) {
    this[name](cb);
  }

  changed() {
    this.wallet.features['standard:events'].on('change', async (info) => {
      if (info && info.accounts) {
        if (!info.accounts.length) {
          return;
        }
      }
      if (info && Object.keys(info).length) {
        // console.log(`Switched to account ${publicKey.toBase58()}`);
        // await cb(publicKey.toBase58());
        this.chainId = info.accounts[0].chains[0];
      }
    });
  }

  async disconnect() {
    await this.wallet.features['standard:disconnect'].disconnect();
  }
}

export default SuiWallet;
