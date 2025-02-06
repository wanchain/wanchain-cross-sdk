const TonWeb = require('tonweb');

class Tonkeeper {
  constructor(network) {
    this.name = "Tonkeeper";
    this.network = network;
    this.wallet = window.tonkeeper.tonconnect;
  }

  // standard function

  async checkWallet() {
    try {
      return await this.connect();
    } catch (err) {
      throw new Error("Not installed or not ready");
    }
  }

  async getChainId() {
    let result = await this.checkWallet();
    return result.items[0].network;
  }

  async getAccounts() {
    let result = await this.checkWallet();
    let wallet = new (TonWeb.Wallets.all.v4R2)(null, {wc: 0, publicKey: Buffer.from(result.items[0].publicKey, "hex")});
    let address = await wallet.getAddress();
    return [address.toString(true, true, false, this.network === "testnet")];
  }

  async getBalance(address, tokenAccount = "") {
    throw new Error("Not support getBalance");
  }

  async sendTransaction(messages, options = {}) {
    let now = Date.now();
    let transaction = {
      valid_until: options.validUntil || (Math.floor(now / 1000) + 60),
      messages
    };
    let result = await this.wallet.send({
      method: 'sendTransaction',
      params: [transaction],
      id: now
    });
    console.log("%s sendTransaction result: %O", this.name, result);
    if (result.result) {
      return result.result;
    } else {
      throw result.error;
    }
  }

  // customized function

  async connect() {
    let result = await this.wallet.connect(2, {
      manifestUrl: 'https://game.zoo.team/tonconnect-manifest.json', // TODO: update
      items: [
        { name: 'ton_addr' },
        // { name: 'ton_proof', payload: '123' }
      ]
    });
    console.log("connect result: %O", result)
    if (result.event === 'connect') {
      return result.payload;
    } else { // 'connect_error'
      throw new Error(result.payload.message);
    }
  }
}

module.exports = Tonkeeper;