const wasm = require("@emurgo/cardano-serialization-lib-asmjs");

class Nami {
  constructor(provider) {
    this.name = "Nami";
    if (!['mainnet', 'testnet'].includes(provider)) {
      throw new Error("Invalid provider, should be 'mainnet' or 'testnet'");
    }
    this.cardano = window.cardano;
  }

  // standard function

  async getChainId() {
    return this.cardano.getNetworkId();
  }

  async getAccounts(network) {
    try {
      await this.cardano.enable();
      let accounts = await this.cardano.getUsedAddresses();
      accounts = accounts.map(v => wasm.Address.from_bytes(Buffer.from(v, 'hex')).to_bech32());
      return accounts;
    } catch (err) {
      console.error("%s not installed or not allowed", this.name);
      throw new Error("Not installed or not allowed");
    }
  }

  async getBalance(addr) { // TODO: support token
    let accounts = await this.getAccounts();
    if (addr === accounts[0]) {
      let balance = await this.cardano.getBalance();
      return wasm.Value.from_bytes(Buffer.from(balance, 'hex')).coin().to_str(); // TODO: sub token locked coin
    } else {
      console.error("%s is not current address", addr);
      throw new Error("Not current address");
    }
  }  

  async sendTransaction(tx, sender) {
    let witnessSet = await this.cardano.signTx(Buffer.from(tx.to_bytes(), 'hex').toString('hex'));
    witnessSet = wasm.TransactionWitnessSet.from_bytes(Buffer.from(witnessSet, "hex"));
    let transaction = wasm.Transaction.new(tx.body(), witnessSet, tx.auxiliary_data());
    let txHash = await this.cardano.submitTx(Buffer.from(transaction.to_bytes(), 'hex').toString('hex'));
    return txHash;
  }

  // customized function

  async getUtxos() {
    let utxos = await this.cardano.getUtxos();
    return utxos.map(utxo => wasm.TransactionUnspentOutput.from_bytes(Buffer.from(utxo, 'hex')));
  }
}

module.exports = Nami;