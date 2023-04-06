const wasm = require("@emurgo/cardano-serialization-lib-asmjs");
const tool = require("../tool.js");

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

  async getBalance(addr, tokenId) {
    let accounts = await this.getAccounts();
    if (addr === accounts[0]) {
      let balance = await this.cardano.getBalance();
      let value = wasm.Value.from_hex(balance);
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

  async sendTransaction(tx, sender) {
    let witnessSet = await this.cardano.signTx(tx.to_hex());
    witnessSet = wasm.TransactionWitnessSet.from_hex(witnessSet);
    let redeemers = tx.witness_set().redeemers();
    if (redeemers) {
      witnessSet.set_redeemers(redeemers);
    }
    let transaction = wasm.Transaction.new(tx.body(), witnessSet, tx.auxiliary_data());
    let txHash = await this.cardano.submitTx(transaction.to_hex());
    return txHash;
  }

  // customized function

  async getUtxos(tokenId) {
    let utxos = await this.cardano.getUtxos();
    return utxos; // utxos.map(utxo => wasm.TransactionUnspentOutput.from_hex(utxo));
    // return utxos.filter(v => {
    //   let utxo = wasm.TransactionUnspentOutput.from_hex(v);
    //   let multiAsset = utxo.output().amount().multiasset();
    //   let totalAssets = tool.multiAssetCount(multiAsset);
    //   if (totalAssets === 0) {
    //     return true; // all tx need ADA utxo
    //   }
    //   if (tokenId) { // token
    //     let [policyId, assetName] = tokenId.split(".");
    //     if ((totalAssets === 1) && (tool.getAssetBalance(multiAsset, policyId, assetName) != 0)) {
    //       return true;
    //     }
    //   }
    //   return false;
    // })
  }

  async getCollateral() {
    let utxos = await this.cardano.getCollateral();
    return utxos.slice(0, 3); // utxos.map(utxo => wasm.TransactionUnspentOutput.from_hex(utxo));
  }
}

module.exports = Nami;