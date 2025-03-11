const wasm = require("../wasm");
const tool = require("../tool.js");

class Lace {
  constructor() {
    this.name = "Lace";
    this.wallet = window.cardano.lace;
    this.wasm = wasm.getWasm();
  }

  // standard function

  async getChainId() {
    let cardano = await this.wallet.enable({extensions: [{cip: 95}]});
    return cardano.getNetworkId();
  }

  async getAccounts() {
    try {
      let cardano = await this.wallet.enable({extensions: [{cip: 95}]});
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
      let cardano = await this.wallet.enable({extensions: [{cip: 95}]});
      let balance = await cardano.getBalance();
      let value = this.wasm.Value.from_hex(balance);
      let result;
      if (tokenId) {
        let [policyId, assetName] = tokenId.split(".");
        if (assetName) { // erc20
          result = await tool.getAssetBalance(value.multiasset(), policyId, assetName);
        } else { // nft
          let nfts = await tool.getNftInfo(value.multiasset(), tokenId);
          result = nfts.length.toString();
        }
      } else { // coin
        result = await value.coin().to_str(); // TODO: sub token locked coin
      }
      return result;
    } else {
      console.error("%s is not current address", addr);
      throw new Error("Not current address");
    }
  }

  async getBalances(addr, tokenIds) {
    let accounts = await this.getAccounts();
    if (addr === accounts[0]) {
      let cardano = await this.wallet.enable({extensions: [{cip: 95}]});
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

  async getNftInfo(addr, tokenId) {
    let accounts = await this.getAccounts();
    if (addr === accounts[0]) {
      let cardano = await this.wallet.enable({extensions: [{cip: 95}]});
      let balance = await cardano.getBalance();
      let value = this.wasm.Value.from_hex(balance);
      let nfts = await tool.getNftInfo(value.multiasset(), tokenId);
      return nfts;
    } else {
      console.error("%s is not current address", addr);
      throw new Error("Not current address");
    }
  }

  async sendTransaction(tx) {
    tx = this.wasm.Transaction.from_hex(tx);
    let cardano = await this.wallet.enable({extensions: [{cip: 95}]});
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
    let cardano = await this.wallet.enable({extensions: [{cip: 95}]});
    let utxos = await cardano.getUtxos();
    return utxos;
  }

  async getCollateral() {
    let cardano = await this.wallet.enable({extensions: [{cip: 95}]});
    let utxos = await cardano.getCollateral();
    utxos = utxos || [];
    return utxos.slice(0, 3);
  }
}

module.exports = Lace;