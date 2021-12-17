const wasm = require("@emurgo/cardano-serialization-lib-asmjs");

class Nami {
  constructor(type, provider) {
    this.type = type;
    this.cardano = window.cardano;
  }

  async getChainId() {
    return this.cardano.getNetworkId();
  }

  async getAccounts(network) {
    try {
      await this.cardano.enable();
      let accounts = await this.cardano.getUsedAddresses();
      accounts = accounts.map(v => wasm.Address.from_bytes(Buffer.from(v, 'hex')));
      return accounts;
    } catch (err) {
      console.error("polkadot{.js} not installed or not allowed");
      throw new Error("Not installed or not allowed");
    }
  }

  async sendTransaction(txs, sender) {
  }

  async buildUserLockMemo(tokenPairID, toPeerChainAccount, fee) {
  }
}

module.exports = Nami;