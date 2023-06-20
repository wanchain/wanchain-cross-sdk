const wasm = require("../wasm");
const tool = require("../tool.js");

class Nami {
  constructor(provider) {
    this.name = "Nami";
    if (!['mainnet', 'testnet'].includes(provider)) {
      throw new Error("Invalid provider, should be 'mainnet' or 'testnet'");
    }
    this.cardano = window.cardano;
    this.wasm = wasm.getWasm();
  }

  // standard function

  async getChainId() {
    return this.cardano.getNetworkId();
  }

  async getAccounts(network) {
    try {
      await this.cardano.enable();
      let accounts = await this.cardano.getUsedAddresses();
      accounts = accounts.map(v => this.wasm.Address.from_bytes(Buffer.from(v, 'hex')).to_bech32());
      return accounts;
    } catch (err) {
      console.error("%s not installed or not allowed: %O", this.name, err);
      throw new Error("Not installed or not allowed");
    }
  }

  async getBalance(addr, tokenId) {
    let accounts = await this.getAccounts();
    if (addr === accounts[0]) {
      let balance = await this.cardano.getBalance();
      let value = this.wasm.Value.from_hex(balance);
      if (tokenId) {
        let [policyId, assetName] = tokenId.split(".");
        return tool.getAssetBalance(value.multiasset(), policyId, assetName);
      } else { // coin
        return value.coin().to_str(); // TODO: sub token locked coin
      }
    } else {
      console.error("%s is not current address", addr);
      throw new Error("Not current address");
    }
  }

  async signTx(tx, sender) {
    let witnessSet = await this.cardano.signTx(tx.to_hex(), true);
    return this.wasm.TransactionWitnessSet.from_hex(witnessSet);
  }

  async sendTransaction(tx, sender) {
    let redeemers = tx.witness_set().redeemers();
    let witnessSet = await this.signTx(tx, sender);
    if (redeemers) {
      witnessSet.set_redeemers(redeemers);
    }
    let transaction = this.wasm.Transaction.new(tx.body(), witnessSet, tx.auxiliary_data());
    let txHash = await this.cardano.submitTx(transaction.to_hex());
    return txHash;
  }

  // customized function

  async getUtxos() {
    let utxos = await this.cardano.getUtxos();
    return utxos.map(utxo => this.wasm.TransactionUnspentOutput.from_hex(utxo));
  }

  async getCollateral() {
    let utxos = await this.cardano.getCollateral();
    return utxos.slice(0, 3).map(utxo => this.wasm.TransactionUnspentOutput.from_hex(utxo));
  }
}

module.exports = Nami;