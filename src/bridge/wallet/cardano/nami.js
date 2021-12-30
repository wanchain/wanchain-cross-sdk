const tool = require("../../../utils/tool.js");
const BigNumber = require("bignumber.js");
const wasm = require("@emurgo/cardano-serialization-lib-asmjs");
const CoinSelection = require("./coinSelection");
const BlockFrostAPI = require('@blockfrost/blockfrost-js').BlockFrostAPI;

// memo should like follows
// memo_Type + memo_Data, Divided Symbols should be '0x'
// Type: 1, normal userLock; Data: tokenPairID + toAccount + fee
// Type: 2, normal smg release; Data: tokenPairId + uniqueId/hashX
// Type: 3, abnormal smg transfer for memo_userLock; Data: uniqueId
// Type: 4, abnomral smg transfer for tag_userLock; Data: tag
// Type: 5, smg debt transfer; Data: srcSmg
const TX_TYPE = {
  UserLock:   1,
  SmgRelease: 2,
  smgDebt:    5,
  Invalid:    -1
}

const WanAccountLen = 40; // This should be peer chain( Wan Or Eth) address length. Exclude leadind '0x'

class Nami {
  constructor(type, provider) {
    if (!['mainnet', 'testnet'].includes(provider)) {
      throw new Error("Invalid provider, should be 'mainnet' or 'testnet'");
    }
    this.type = type;
    this.cardano = window.cardano;
    this.blockfrost = new BlockFrostAPI({isTestNet:provider === "testnet", projectId: 'testnetuBFkbLWQvS43rZCQSrYkFFL1gnHaxt3Z'});
  }

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

  async sendTransaction(txs, sender) {
  }

  // customized function

  buildUserLockData(tokenPairID, toAccount, fee) {
    tokenPairID = Number(tokenPairID);
    toAccount = tool.hexStrip0x(toAccount);
    if ((tokenPairID !== NaN) && (toAccount.length === WanAccountLen)) {
      let data = {
        1: {
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
    const latest_block = await blockfrostRequest('/blocks/latest');
    const p = await blockfrostRequest(`/epochs/${latest_block.epoch}/parameters`);
  
    return {
      linearFee: {
        minFeeA: p.min_fee_a.toString(),
        minFeeB: p.min_fee_b.toString(),
      },
      minUtxo: '1000000', //p.min_utxo, minUTxOValue protocol paramter has been removed since Alonzo HF. Calulation of minADA works differently now, but 1 minADA still sufficient for now
      poolDeposit: p.pool_deposit,
      keyDeposit: p.key_deposit,
      coinsPerUtxoWord: p.coins_per_utxo_word,
      maxValSize: p.max_val_size,
      priceMem: p.price_mem,
      priceStep: p.price_step,
      maxTxSize: parseInt(p.max_tx_size),
      slot: parseInt(latest_block.slot),
    };
  };
  
  async buildTx(account, utxos, outputs, protocolParameters, auxiliaryData) {
    await Loader.load();
  
    const totalAssets = await multiAssetCount(
      outputs.get(0).amount().multiasset()
    );
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
  
    const txBuilderConfig = Loader.Cardano.TransactionBuilderConfigBuilder.new()
      .coins_per_utxo_word(
        Loader.Cardano.BigNum.from_str(protocolParameters.coinsPerUtxoWord)
      )
      .fee_algo(
        Loader.Cardano.LinearFee.new(
          Loader.Cardano.BigNum.from_str(protocolParameters.linearFee.minFeeA),
          Loader.Cardano.BigNum.from_str(protocolParameters.linearFee.minFeeB)
        )
      )
      .key_deposit(Loader.Cardano.BigNum.from_str(protocolParameters.keyDeposit))
      .pool_deposit(
        Loader.Cardano.BigNum.from_str(protocolParameters.poolDeposit)
      )
      .max_tx_size(protocolParameters.maxTxSize)
      .max_value_size(protocolParameters.maxValSize)
      .prefer_pure_change(true)
      .build();
  
    const txBuilder = Loader.Cardano.TransactionBuilder.new(txBuilderConfig);
  
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
  
    txBuilder.set_ttl(protocolParameters.slot + TX.invalid_hereafter);
    txBuilder.add_change_if_needed(
      Loader.Cardano.Address.from_bech32(account.paymentAddr)
    );
  
    const transaction = Loader.Cardano.Transaction.new(
      txBuilder.build(),
      Loader.Cardano.TransactionWitnessSet.new(),
      txBuilder.get_auxiliary_data()
    );
  
    return transaction;
  };  
}

module.exports = Nami;