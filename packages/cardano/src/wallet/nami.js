const wasm = require("../wasm");
const tool = require("../tool.js");

class Nami {
  constructor() {
    this.name = "Nami";
    this.cardano = window.cardano;
    this.wasm = wasm.getWasm();
  }

  // standard function

  async getChainId() {
    return this.cardano.getNetworkId();
  }

  async getAccounts() {
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

  async getBalances(addr, tokenIds) {
    let accounts = await this.getAccounts();
    if (addr === accounts[0]) {
      let balance = await cardano.getBalance();
      let value = this.wasm.Value.from_hex(balance);
      return tokenIds.map(id => {
        if (id) {
          let [policyId, assetName] = id.split(".");
          return tool.getAssetBalance(value.multiasset(), policyId, assetName);
        } else {
          return value.coin().to_str(); // TODO: sub token locked coin
        }
      })
    } else {
      console.log("%s is not used address", addr);
      throw new Error("Not used address");
    }
  }

  async sendTransaction(tx) {
    tx = this.wasm.Transaction.from_hex(tx);
    let witnessSet = await this.cardano.signTx(tx.to_hex());
    witnessSet = this.wasm.TransactionWitnessSet.from_hex(witnessSet);
    let redeemers = tx.witness_set().redeemers();
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
    return utxos;
  }

  async getCollateral() {
    let utxos = await this.cardano.getCollateral();
    return utxos.slice(0, 3);
  }
}

module.exports = Nami;