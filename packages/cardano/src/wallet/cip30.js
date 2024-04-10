const wasm = require("../wasm");
const tool = require("../tool.js");

class Cip30 {
  constructor(wallet) {
    this.name = "Cip30";
    this.wallet = wallet;
    this.wasm = wasm.getWasm();
  }

  // standard function

  async getChainId() {
    let cardano = await this.wallet.enable();
    return cardano.getNetworkId();
  }

  async getAccounts() {
    try {
      let cardano = await this.wallet.enable();
      let accounts = await cardano.getUsedAddresses();
      accounts = accounts.map(v => this.wasm.Address.from_bytes(Buffer.from(v, 'hex')).to_bech32());
      return accounts;
    } catch (err) {
      console.error("this %s wallet not installed or not allowed: %O", this.name, err);
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
      console.error("%s is not used address", addr);
      throw new Error("Not used address");
    }
  }

  async getBalances(addr, tokenIds) {
    let accounts = await this.getAccounts();
    if (accounts.includes(addr)) {
      let cardano = await this.wallet.enable();
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
    let cardano = await this.wallet.enable();
    let witnessSet = await cardano.signTx(tx.to_hex());
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

  async getCollateral(amount = "3000000") {
    let cardano = await this.wallet.enable();
    let utxos = await cardano.getCollateral(amount);
    return utxos.slice(0, 3).map(utxo => this.wasm.TransactionUnspentOutput.from_hex(utxo));
  }
}

module.exports = Cip30;