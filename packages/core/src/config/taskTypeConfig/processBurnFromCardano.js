'use strict';

const tool = require("../../utils/tool.js");

/* metadata format:
  userBurn:
  {
    type: 8,             // number
    tokenPairID: 1,      // number
    toAccount: 0x...,    // string
    smgID: 0x...         // string
  }
  smgMint:
  {
    type: 9,             // number
    tokenPairID: 1,      // number
    uniqueId: 0x...      // string
  }
*/

const TX_TYPE = {
  UserLock:   1,
  SmgRelease: 2,
  smgDebt:    5,
  smgProxy:   6,
  smgPhaDebt: 7,
  userBurn:   8,
  smgMint:    9,
  Invalid:   -1
};

module.exports = class ProcessBurnFromCardano {
  constructor(frameworkService) {
    this.frameworkService = frameworkService;
    this.iwan = frameworkService.getService("iWanConnectorService");
    let configService = frameworkService.getService("ConfigService");
    let extension = configService.getExtension("ADA");
    this.wasm = extension.wasm;
  }

  async process(stepData, wallet) {
    let webStores = this.frameworkService.getService("WebStores");
    //console.debug("ProcessAdaMintFromCardano stepData:", stepData);
    let params = stepData.params;
    try {
      let protocolParameters = await this.initTx();
      let utxos = await wallet.cardano.getUtxos();
      utxos = utxos.map(utxo => this.wasm.TransactionUnspentOutput.from_bytes(Buffer.from(utxo, 'hex')));
      // this.showUtxos(utxos);

      let tokenPairService = this.frameworkService.getService("TokenPairService");
      let tokenPair = tokenPairService.getTokenPair(params.tokenPairID);
      let isCoin = (tokenPair.fromAccount === "0x0000000000000000000000000000000000000000");
      let output = {
        address: this.wasm.Address.from_bech32(params.crossScAddr),
        amount: [
          {
            unit: 'lovelace',
            quantity: isCoin? params.value : '10000000' // actual or probable locked quantity
          },
        ],
      };
      if (!isCoin) { // for token, to construct multiassets and calculate minAda to lock
        output.amount.push({
          unit: tool.hexStrip0x(tokenPair.fromAccount), // policyId(56) + name
          quantity: params.value
        });
        let outputValue = await this.assetsToValue(output.amount);
        let minAda = this.minAdaRequired(
          outputValue,
          this.wasm.BigNum.from_str(
            protocolParameters.minUtxo
          )
        );
        // console.debug({minAda});
        output.amount[0].quantity = minAda;
      }
      // console.log("output.amount: %O", output.amount);
      let outputs = this.wasm.TransactionOutputs.new();
      outputs.add(
        this.wasm.TransactionOutput.new(
          this.wasm.Address.from_bech32(params.crossScAddr),
          this.assetsToValue(output.amount)
        )
      );

      let metaData = await this.buildUserLockData(params.tokenPairID, params.userAccount, params.storemanGroupId);
      let auxiliaryData = this.wasm.AuxiliaryData.new();
      auxiliaryData.set_metadata(metaData);

      let plutusData = this.genPlutusData();

      let tx;
      try {
        tx = await wallet.buildTx(params.fromAddr, utxos, outputs, protocolParameters, auxiliaryData, plutusData);
      } catch (err) {
        console.error("ProcessAdaMintFromCardano buildTx error: %O", err);
        webStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Failed", tool.getErrMsg(err, "Failed to send transaction"));
        return;
      }

      // sign and send
      let txHash;
      try {
        txHash = await wallet.sendTransaction(tx, params.fromAddr);
        webStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, stepData.stepIndex, txHash, ""); // only update txHash, no result
      } catch (err) {
        console.error("ProcessAdaMintFromCardano sendTransaction error: %O", err);
        if (err.info === "User declined to sign the transaction.") { // code 2 include other errors
          webStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Rejected");
        } else {
          webStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Failed", tool.getErrMsg(err, "Failed to send transaction"));
        }
        return;
      }

      // check receipt
      let iwan = this.frameworkService.getService("iWanConnectorService");
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

      let checkAdaTxService = this.frameworkService.getService("CheckAdaTxService");
      await checkAdaTxService.addTask(checkPara);
    } catch (err) {
      console.error("ProcessAdaMintFromCardano error: %O", err);
      webStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Failed", tool.getErrMsg(err, "Failed to send transaction"));
    }
  }

  async initTx() {
    let latestBlock = await this.iwan.getLatestBlock("ADA");
    let p = await this.iwan.getEpochParameters("ADA", {epochID: "latest"});
    let result = {
      linearFee: {
        minFeeA: p.min_fee_a.toString(),
        minFeeB: p.min_fee_b.toString(),
      },
      minUtxo: '1000000', // p.min_utxo, minUTxOValue protocol paramter has been removed since Alonzo HF. Calulation of minADA works differently now, but 1 minADA still sufficient for now
      poolDeposit: p.pool_deposit,
      keyDeposit: p.key_deposit,
      coinsPerUtxoByte: p.coins_per_utxo_byte,
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
    let multiAsset = this.wasm.MultiAsset.new();
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
      let assetsValue = this.wasm.Assets.new();
      policyAssets.forEach((asset) => {
        assetsValue.insert(
          this.wasm.AssetName.new(Buffer.from(asset.unit.slice(56), 'hex')),
          this.wasm.BigNum.from_str(asset.quantity)
        );
      });
      multiAsset.insert(
        this.wasm.ScriptHash.from_bytes(Buffer.from(policy, 'hex')),
        assetsValue
      );
    });
    let value = this.wasm.Value.new(
      this.wasm.BigNum.from_str(lovelace ? lovelace.quantity : '0')
    );
    if (assets.length > 1 || !lovelace) value.set_multiasset(multiAsset);
    return value;
  }

  minAdaRequired(value, minUtxo) {
    return this.wasm.min_ada_required(
      value,
      minUtxo
    ).to_str();
  }

  buildUserLockData(tokenPairID, toAccount, smgID) {
    let data = {
      1: {
        type: TX_TYPE.UserLock,
        tokenPairID: Number(tokenPairID),
        toAccount,
        smgID
      }
    };
    // console.debug("nami buildUserLockData: %O", data);
    data = this.wasm.encode_json_str_to_metadatum(JSON.stringify(data), this.wasm.MetadataJsonSchema.BasicConversions);
    return this.wasm.GeneralTransactionMetadata.from_bytes(data.to_bytes());
  }

  genPlutusData() { // just dummy data
    let ls = this.wasm.PlutusList.new();
    ls.add(this.wasm.PlutusData.new_integer(this.wasm.BigInt.from_str('1')));
    return this.wasm.PlutusData.new_constr_plutus_data(
        this.wasm.ConstrPlutusData.new(
            this.wasm.BigNum.from_str('0'),
            ls
        )
    )
  }
};