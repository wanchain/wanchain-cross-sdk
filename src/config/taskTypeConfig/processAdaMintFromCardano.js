'use strict';

const BigNumber = require("bignumber.js");
const wasm = require("@emurgo/cardano-serialization-lib-asmjs");
const tool = require("../../utils/tool.js");

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

const ToAccountLen = 42; // with '0x'

module.exports = class ProcessAdaMintFromCardano {
  constructor(frameworkService) {
    this.m_frameworkService = frameworkService;
    this.m_iwanBCConnector = frameworkService.getService("iWanConnectorService");
  }

  async process(stepData, wallet) {
    let webStores = this.m_frameworkService.getService("WebStores");
    //console.debug("ProcessAdaMintFromCardano stepData:", stepData);
    let params = stepData.params;
    try {
      let storemanGroupAddr = "addr_test1qz3ga6xtwkxn2aevf8jv0ygpq3cpseen68mcuz2fqe3lu0s9ag8xf2vwvdxtt6su2pn6h7rlnnnsqweavyqgd2ru3l3q09lq9e"; // smg address is manual specified
      console.debug("ProcessAdaMintFromCardano storemanGroupAddr: %s", storemanGroupAddr);

      let protocolParameters = await this.initTx();
      let utxos = await wallet.cardano.getUtxos();
      utxos = utxos.map(utxo => wasm.TransactionUnspentOutput.from_bytes(Buffer.from(utxo, 'hex')));
      // this.showUtxos(utxos);

      let storemanService = this.m_frameworkService.getService("StoremanService");
      let tokenPair = storemanService.getTokenPair(params.tokenPairID);
      let isCoin = (tokenPair.fromAccount === "0x0000000000000000000000000000000000000000");
      let output = {
        address: wasm.Address.from_bech32(storemanGroupAddr),
        amount: [
          {
            unit: 'lovelace',
            quantity: isCoin? params.value : '10000000' // actual or probable locked quantity,
          },
        ],
      };
      if (!isCoin) { // for token, to construct multiassets and calculate minAda to lock
        output.amount.push({
          unit: tool.hexStrip0x().slice(0, 56), // Testcoin: '6b8d07d69639e9413dd637a1a815a7323c69c86abbafb66dbfdb1aa7',
          quantity: params.value
        });
        let outputValue = await this.assetsToValue(output.amount);
        let minAda = this.minAdaRequired(
          outputValue,
          wasm.BigNum.from_str(
            protocolParameters.minUtxo
          )
        );
        // console.debug({minAda});
        output.amount[0].quantity = minAda;
      }
      console.log("output.amount: %O", output.amount);
      let outputs = wasm.TransactionOutputs.new();
      outputs.add(
        wasm.TransactionOutput.new(
          wasm.Address.from_bech32(storemanGroupAddr),
          this.assetsToValue(output.amount)
        )
      );

      let metaData = await this.buildUserLockData(params.tokenPairID, params.userAccount, params.fee);
      let auxiliaryData = wasm.AuxiliaryData.new();
      auxiliaryData.set_metadata(metaData);

      let tx;
      try {
        tx = await wallet.buildTx(params.fromAddr, utxos, outputs, protocolParameters, auxiliaryData);
      } catch (err) {
        console.error("ProcessAdaMintFromCardano buildTx error: %O", err);
        if (err === "Insufficient input in transaction") {
          webStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Failed", "Insufficient balance");
        } else {
          err = (typeof(err) === "string")? err : undefined;
          webStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Failed", err || "Failed to send transaction");
        }
        return;
      }

      // sign and send
      let txHash;
      try {
        txHash = await wallet.sendTransaction(tx, params.fromAddr);
        webStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, stepData.stepIndex, txHash, ""); // only update txHash, no result
      } catch (err) {
        console.error("ProcessAdaMintFromCardano sendTransaction error: %O", err);
        if (err.code === 2) { // info: "User declined to sign the transaction."
          webStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Rejected");
        } else {
          webStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Failed", err.message || "Failed to send transaction");
        }
        return;
      }

      // check receipt
      let iwan = this.m_frameworkService.getService("iWanConnectorService");
      let blockNumber = await iwan.getBlockNumber(params.toChainType);
      let checkPara = {
        ccTaskId: params.ccTaskId,
        stepIndex: stepData.stepIndex,
        fromBlockNumber: blockNumber,
        txHash,
        chain: params.toChainType,
        smgPublicKey: params.storemanGroupGpk,
        taskType: "MINT"
      };

      let checkAdaTxService = this.m_frameworkService.getService("CheckAdaTxService");
      await checkAdaTxService.addTask(checkPara);
    } catch (err) {
      console.error("ProcessAdaMintFromCardano error: %O", err);
      webStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Failed", err.message || "Failed to send transaction");
    }
  }

  async initTx() {
    let latestBlock = await this.m_iwanBCConnector.getLatestBlock("ADA");
    let p = await this.m_iwanBCConnector.getEpochParameters("ADA", {epochID: "latest"});
    let result = {
      linearFee: {
        minFeeA: p.min_fee_a.toString(),
        minFeeB: p.min_fee_b.toString(),
      },
      minUtxo: '1000000', // p.min_utxo, minUTxOValue protocol paramter has been removed since Alonzo HF. Calulation of minADA works differently now, but 1 minADA still sufficient for now
      poolDeposit: p.pool_deposit,
      keyDeposit: p.key_deposit,
      coinsPerUtxoWord: p.coins_per_utxo_word,
      maxValSize: p.max_val_size,
      priceMem: p.price_mem,
      priceStep: p.price_step,
      maxTxSize: parseInt(p.max_tx_size),
      slot: parseInt(latestBlock.slot),
    };
    console.debug("ProcessAdaMintFromCardano initTx: %O", result);
    return result;
  }

  assetsToValue(assets) {
    let multiAsset = wasm.MultiAsset.new();
    let lovelace = assets.find((asset) => asset.unit === 'lovelace');
    let policies = [
      ...new Set(
        assets
          .filter((asset) => asset.unit !== 'lovelace')
          .map((asset) => asset.unit.slice(0, 56))
      ),
    ];
    policies.forEach((policy) => {
      let policyAssets = assets.filter(
        (asset) => asset.unit.slice(0, 56) === policy
      );
      let assetsValue = wasm.Assets.new();
      policyAssets.forEach((asset) => {
        assetsValue.insert(
          wasm.AssetName.new(Buffer.from(asset.unit.slice(56), 'hex')),
          wasm.BigNum.from_str(asset.quantity)
        );
      });
      multiAsset.insert(
        wasm.ScriptHash.from_bytes(Buffer.from(policy, 'hex')),
        assetsValue
      );
    });
    let value = wasm.Value.new(
      wasm.BigNum.from_str(lovelace ? lovelace.quantity : '0')
    );
    if (assets.length > 1 || !lovelace) value.set_multiasset(multiAsset);
    return value;
  }

  minAdaRequired(value, minUtxo) {
    return wasm.min_ada_required(
      value,
      minUtxo
    ).to_str();
  }

  buildUserLockData(tokenPairID, toAccount, fee) {
    tokenPairID = Number(tokenPairID);
    if ((tokenPairID !== NaN) && (toAccount.length === ToAccountLen)) {
      let data = {
        5718350: { // define a special label, which is SLIP-0044 Wanchain Coin type
          type: TX_TYPE.UserLock,
          tokenPairID,
          toAccount,
          fee: Number(new BigNumber(fee).toFixed())
        }
      };
      // console.debug("nami buildUserLockData: %O", data);
      data = wasm.encode_json_str_to_metadatum(JSON.stringify(data), wasm.MetadataJsonSchema.BasicConversions);
      return wasm.GeneralTransactionMetadata.from_bytes(data.to_bytes());
    } else {
      console.error("buildUserLockMetaData parameter invalid");
      return null;
    }
  }

  showUtxos(utxos) {
    let outs = [];
    utxos.map(utxo => {
      let o = utxo.output();
      let tokens = [];
      let ma = o.amount().multiasset();
      if (ma) {
        let scripts = ma.keys();
        for (let i = 0; i < scripts.len(); i++) {
          let script = scripts.get(i);
          let assets = ma.get(script);
          let names = assets.keys();
          for (let j = 0; j < names.len(); j++) {
            let name = names.get(j);
            tokens.push({script: tool.bytes2Hex(script.to_bytes()), name: name.name().toString(), value: assets.get(name).to_str()})
          }
        }
      }
      outs.push({to: o.address().to_bech32(), coin: o.amount().coin().to_str(), tokens});
    });
    console.debug("utxos output: %O", outs);
  }
};