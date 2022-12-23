const wasm = require("@emurgo/cardano-serialization-lib-asmjs");
const CoinSelection = require("./coinSelection");

const TX = {
  invalid_hereafter: 3600 * 2, // 2h from current slot
};

class Nami {
  constructor(type, provider) {
    if (!['mainnet', 'testnet'].includes(provider)) {
      throw new Error("Invalid provider, should be 'mainnet' or 'testnet'");
    }
    this.type = type;
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
      console.error("%s not installed or not allowed", this.type);
      throw new Error("Not installed or not allowed");
    }
  }

  async getBalance(addr) { // TODO: support token
    let accounts = await this.getAccounts();
    if (addr === accounts[0]) {
      let balance = await this.cardano.getBalance();
      return wasm.Value.from_bytes(Buffer.from(balance, 'hex')).coin().to_str(); // TODO: sub token locked coin
    } else {
      console.error("%s is not used address", addr);
      throw new Error("Not used address");
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

  async multiAssetCount(multiAsset) {
    if (!multiAsset) return 0;
    let count = 0;
    const policies = multiAsset.keys();
    for (let j = 0; j < multiAsset.len(); j++) {
      const policy = policies.get(j);
      const policyAssets = multiAsset.get(policy);
      const assetNames = policyAssets.keys();
      for (let k = 0; k < assetNames.len(); k++) {
        count++;
      }
    }
    return count;
  }
  
  async buildTx(paymentAddr, utxos, outputs, protocolParameters, auxiliaryData, plutusData) {
    const totalAssets = await this.multiAssetCount(
      outputs.get(0).amount().multiasset()
    );
    console.log({CoinSelection, protocolParameters})
    CoinSelection.setProtocolParameters(
      protocolParameters.coinsPerUtxoWord,
      protocolParameters.linearFee.minFeeA,
      protocolParameters.linearFee.minFeeB,
      protocolParameters.maxTxSize.toString()
    );
    const selection = await CoinSelection.randomImprove(
      utxos,
      outputs,
      20 + totalAssets
    );
    const inputs = selection.input;
  
    let txBuilder = wasm.TransactionBuilder.new(
      wasm.LinearFee.new(
        wasm.BigNum.from_str(protocolParameters.linearFee.minFeeA),
        wasm.BigNum.from_str(protocolParameters.linearFee.minFeeB)
      ),
      wasm.BigNum.from_str(protocolParameters.minUtxo),
      wasm.BigNum.from_str(protocolParameters.poolDeposit),
      wasm.BigNum.from_str(protocolParameters.keyDeposit),
      protocolParameters.maxValSize,
      protocolParameters.maxTxSize
    );
  
    for (let i = 0; i < inputs.length; i++) {
      const utxo = inputs[i];
      txBuilder.add_input(
        utxo.output().address(),
        utxo.input(),
        utxo.output().amount()
      );
    }

    let output = outputs.get(0);
    if (plutusData) {
      output.set_plutus_data(plutusData);
    }
    txBuilder.add_output(output);
  
    if (auxiliaryData) txBuilder.set_auxiliary_data(auxiliaryData);
  
    txBuilder.set_ttl(protocolParameters.slot + TX.invalid_hereafter);
    txBuilder.add_change_if_needed(
      wasm.Address.from_bech32(paymentAddr)
    );
  
    const transaction = wasm.Transaction.new(
      txBuilder.build(),
      wasm.TransactionWitnessSet.new(),
      auxiliaryData
    );
  
    return transaction;
  }
}

module.exports = Nami;