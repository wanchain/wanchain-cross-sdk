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
    let selfUtxos = await this._filterUtxos(utxos.map(utxo => this.wasm.TransactionUnspentOutput.from_hex(utxo)));
    return selfUtxos;
  }

  async getCollateral(value = "3000000") {
    let cardano = await this.wallet.enable();
    let utxos = await cardano.getCollateral(value);
    return utxos.slice(0, 3).map(utxo => this.wasm.TransactionUnspentOutput.from_hex(utxo));
  }

  async _filterUtxos(utxos) {
    let cardano = await this.wallet.enable();
    let accounts = await cardano.getUsedAddresses();
    let accountSet = new Set();
    accounts.forEach(v => accountSet.add(this.wasm.Address.from_bytes(Buffer.from(v, 'hex')).to_bech32()));
    console.log("_filterUtxos by accounts: %O", accountSet)
    return utxos.filter(v => {
      let output = v.output().address().to_bech32();
      if (accountSet.has(output)) {
        tool.showUtxos([v], "owned");
        return true;
      } else {
        tool.showUtxos([v], "filter not owned");
        return false;
      }
    });
  }
}

module.exports = Yoroi;