const BigNumber = require("bignumber.js");
const wasm = require("@emurgo/cardano-serialization-lib-asmjs");
const CoinSelection = require("./coinSelection");

/* metadata format:
  userLock:
  {
    type: 1,             // number
    tokenPairID: 1,      // number
    toAccount: 0x...,    // string
    fee: 10              // number
  }
  smgRelease:
  {
    type: 2,             // number
    tokenPairID: 1,      // number
    uniqueId: 0x...      // string
  }
*/

const TX_TYPE = {
  UserLock:   1,
  SmgRelease: 2,
  smgDebt:    5,
  Invalid:    -1
};

const TX = {
  invalid_hereafter: 3600 * 2, // 2h from current slot
};

const ToAccountLen = 42; // with '0x'

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
      console.error("polkadot{.js} not installed or not allowed");
      throw new Error("Not installed or not allowed");
    }
  }

  async getBalance(addr) {
    let accounts = await this.getAccounts();
    if (addr === accounts[0]) {
      let balance = await this.cardano.getBalance();
      return wasm.BigNum.from_bytes(Buffer.from(balance, 'hex')).to_str();
    } else {
      console.error("%s is not used address", addr);
      throw new Error("Not used address");
    }
  }  

  async sendTransaction(tx, sender) {
    let witnessSet = await this.cardano.signTx(Buffer.from(tx.to_bytes(), 'hex').toString('hex'));
    witnessSet = wasm.TransactionWitnessSet.from_bytes(Buffer.from(witnessSet,"hex"));
    let transaction = wasm.Transaction.new(tx.body(), witnessSet, tx.auxiliary_data());
    let txHash = await this.cardano.submitTx(Buffer.from(transaction.to_bytes(), 'hex').toString('hex'));
    return txHash;
  }

  // customized function

  buildUserLockData(tokenPairID, toAccount, fee) {
    tokenPairID = Number(tokenPairID);
    if ((tokenPairID !== NaN) && (toAccount.length === ToAccountLen)) {
      let data = {
        5718350: {
          type: TX_TYPE.UserLock,
          tokenPairID,
          toAccount,
          fee: Number(new BigNumber(fee).toFixed())
        }
      };
      console.debug("nami buildUserLockData: %O", data);
      data = wasm.encode_json_str_to_metadatum(JSON.stringify(data), wasm.MetadataJsonSchema.BasicConversions);
      return wasm.GeneralTransactionMetadata.from_bytes(data.to_bytes());
    } else {
      console.error("buildUserLockMetaData parameter invalid");
      return null;
    }
  }

  async initTx() {
    // let latest_block = await this.blockfrost.blocksLatest();
    // let p = await this.blockfrost.epochsParameters(latest_block.height);
    // console.log({latest_block, p});
  
    // let result = {
    //   linearFee: {
    //     minFeeA: p.min_fee_a.toString(),
    //     minFeeB: p.min_fee_b.toString(),
    //   },
    //   minUtxo: p.min_utxo, //p.min_utxo, minUTxOValue protocol paramter has been removed since Alonzo HF. Calulation of minADA works differently now, but 1 minADA still sufficient for now
    //   poolDeposit: p.pool_deposit,
    //   keyDeposit: p.key_deposit,
    //   coinsPerUtxoWord: p.coins_per_utxo_word,
    //   maxValSize: p.max_val_size,
    //   priceMem: p.price_mem,
    //   priceStep: p.price_step,
    //   maxTxSize: parseInt(p.max_tx_size),
    //   slot: parseInt(latest_block.slot),
    // };

    let result = {
      linearFee: {
        minFeeA: '44',
        minFeeB: '155381',
      },
      minUtxo: '1000000', //p.min_utxo, minUTxOValue protocol paramter has been removed since Alonzo HF. Calulation of minADA works differently now, but 1 minADA still sufficient for now
      poolDeposit: '500000000',
      keyDeposit: '2000000',
      coinsPerUtxoWord: '34482',
      maxValSize: 1000,
      // priceMem: p.price_mem,
      // priceStep: p.price_step,
      maxTxSize: 10000,
      // slot: parseInt(latest_block.slot),
    };

    console.log("initTx: %O", result);
    return result;
  };

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
  };
  
  async buildTx(paymentAddr, utxos, outputs, protocolParameters, auxiliaryData) {
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
      wasm.BigNum.from_str(protocolParameters.minUtxo),// minimum utxo value
      wasm.BigNum.from_str(protocolParameters.poolDeposit),  // pool deposit
      wasm.BigNum.from_str(protocolParameters.keyDeposit),// key deposit
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
  
    txBuilder.add_output(outputs.get(0));
  
    if (auxiliaryData) txBuilder.set_auxiliary_data(auxiliaryData);
  
    // txBuilder.set_ttl(protocolParameters.slot + TX.invalid_hereafter);
    txBuilder.add_change_if_needed(
      wasm.Address.from_bech32(paymentAddr)
    );
  
    const transaction = wasm.Transaction.new(
      txBuilder.build(),
      wasm.TransactionWitnessSet.new(),
      auxiliaryData
    );
  
    return transaction;
  };  
}

module.exports = Nami;