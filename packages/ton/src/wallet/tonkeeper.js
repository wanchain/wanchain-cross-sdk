const TonWeb = require('tonweb');
const {Cell} = require("@ton/core");

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

  async sendTransaction(msg, options = {}) {
    let now = Date.now();
    let transaction = {
      valid_until: options.validUntil || (Math.floor(now / 1000) + 60),
      messages: [msg]
    };
    let res = await this.wallet.send({
      method: 'sendTransaction',
      params: [JSON.stringify(transaction)],
      id: now.toString()
    });
    if (res.result) {
      let cell = Cell.fromBoc(Buffer.from(res.result, 'base64'))[0];
      return cell.hash().toString('base64'); // msgHash
    } else {
      throw res.error;
    }
  }

  // customized function

  async connect() {
    let result = await this.wallet.connect(2, {
      manifestUrl: 'https://dedust.io/tonconnect-manifest.json', // TODO: update
      items: [{name: 'ton_addr'}]
    });
    if (result.event === 'connect') {
      return result.payload;
    } else { // 'connect_error'
      throw new Error(result.payload.message);
    }
  }
}

module.exports = Tonkeeper;