const wasm = require("../wasm");
const tool = require("../tool.js");

class Gero {
  constructor(provider) {
    this.name = "Gero";
    if (!['mainnet', 'testnet'].includes(provider)) {
      throw new Error("Invalid provider, should be 'mainnet' or 'testnet'");
    }
    this.wallet = window.cardano.gerowallet;
    this.wasm = wasm.getWasm();
  }

  // standard function

  async getChainId() {
    let cardano = await this.wallet.enable();
    return cardano.getNetworkId();
  }

  async getAccounts(network) {
    try {
      let cardano = await this.wallet.enable();
      let accounts = await cardano.getUsedAddresses();
      accounts = accounts.map(v => this.wasm.Address.from_bytes(Buffer.from(v, 'hex')).to_bech32());
      return accounts;
    } catch (err) {
      console.error("%s wallet not installed or not allowed: %O", this.name, err);
      throw new Error("Not installed or not allowed");
    }
  }

  async getBalance(addr, tokenId) {
    let accounts = await this.getAccounts();
    if (accounts.includes(addr)) {
      let cardano = await this.wallet.enable();
      let balance = await cardano.getBalance();
      let value = this.wasm.Value.from_hex(balance);
      if (tokenId) {
        let [policyId, assetName] = tokenId.split(".");
        return tool.getAssetBalance(value.multiasset(), policyId, assetName);
      } else { // coin
        return value.coin().to_str(); // TODO: sub token locked coin
      }
    } else {
      console.log("%s is not used address", addr);
      throw new Error("Not used address");
    }
  }

  async sendTransaction(tx, sender) {
    let cardano = await this.wallet.enable();
    let witnessSet = await cardano.signTx(tx.to_hex(), true);
    witnessSet = this.wasm.TransactionWitnessSet.from_hex(witnessSet);
    let redeemers = tx.witness_set().redeemers();
    if (redeemers) {
      witnessSet.set_redeemers(redeemers);
    }
    let transaction = this.wasm.Transaction.new(tx.body(), witnessSet, tx.auxiliary_data());
    let txHash = await cardano.submitTx(transaction.to_hex());
    return txHash;
  }

  // customized function

  async getUtxos() {
    let cardano = await this.wallet.enable();
    let utxos = await cardano.getUtxos();
    return utxos.map(utxo => this.wasm.TransactionUnspentOutput.from_hex(utxo));
  }

  async getCollateral() {
    let cardano = await this.wallet.enable();
    let utxos = await cardano.getCollateral();
    return utxos.slice(0, 3).map(utxo => this.wasm.TransactionUnspentOutput.from_hex(utxo));
  }
}

module.exports = Gero;