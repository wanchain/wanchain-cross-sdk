const wasm = require("../wasm");
const tool = require("../tool.js");

class Yoroi {
  constructor(provider) {
    this.name = "Yoroi";
    if (!['mainnet', 'testnet'].includes(provider)) {
      throw new Error("Invalid provider, should be 'mainnet' or 'testnet'");
    }
    this.wallet = window.cardano.yoroi;
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
      console.error("%s not installed or not allowed: %O", this.name, err);
      throw new Error("Not installed or not allowed");
    }
  }

  async getBalance(addr, tokenId) {
    let accounts = await this.getAccounts();
    if (addr === accounts[0]) {
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
      console.error("%s is not current address", addr);
      throw new Error("Not current address");
    }
  }

  async signTx(tx, sender) {
    let cardano = await this.wallet.enable();
    let witnessSet = await cardano.signTx(tx.to_hex(), true);
    return this.wasm.TransactionWitnessSet.from_hex(witnessSet);
  }

  async sendTransaction(tx, sender) {
    let redeemers = tx.witness_set().redeemers();
    let witnessSet = await this.signTx(tx, sender);
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
    let utxos = await cardano.getCollateral("5000000");
    return utxos.slice(0, 3).map(utxo => this.wasm.TransactionUnspentOutput.from_hex(utxo));
  }
}

module.exports = Yoroi;