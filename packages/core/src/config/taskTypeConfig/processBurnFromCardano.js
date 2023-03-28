'use strict';

const axios = require("axios");
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
  userLock:   1,
  smgRelease: 2,
  smgDebt:    5,
  smgProxy:   6,
  smgPhaDebt: 7,
  userBurn:   8,
  smgMint:    9,
  invalid:   -1
};

module.exports = class ProcessBurnFromCardano {
  constructor(frameworkService) {
    this.frameworkService = frameworkService;
    this.storemanService = frameworkService.getService("StoremanService");
    let configService = frameworkService.getService("ConfigService");
    let apiServerConfig = configService.getGlobalConfig("apiServer");
    this.apiServerUrl = apiServerConfig.url;
    let extension = configService.getExtension("ADA");
    this.tool = extension.tool;
    this.wasm = extension.tool.getWasm();
  }

  async process(stepData, wallet) {
    let webStores = this.frameworkService.getService("WebStores");
    //console.debug("ProcessAdaMintFromCardano stepData:", stepData);
    let params = stepData.params;
    try {
      let epochParameters = await this.storemanService.getCardanoEpochParameters();
      let tokenPairService = this.frameworkService.getService("TokenPairService");
      let tokenPair = tokenPairService.getTokenPair(params.tokenPairID);
      let output = {
        address: this.wasm.Address.from_bech32(params.crossScAddr),
        amount: [
          {
            unit: 'lovelace',
            quantity: '10000000' // actual or probable locked quantity
          }
        ]
      };      
      // for token, to construct multiassets and calculate minAda to lock
      output.amount.push({
        unit: tool.ascii2letter(tool.hexStrip0x(tokenPair.toAccount)).replace(/\./g, ""), // policyId(28 bytes) + "." + name
        quantity: params.value
      });
      let outputValue = this.tool.assetsToValue(output.amount);
      let minAda = this.tool.minAdaRequired(
        outputValue,
        this.wasm.BigNum.from_str(
          epochParameters.minUtxo
        )
      );
      // console.debug({minAda});
      output.amount[0].quantity = minAda;

      // console.log("output.amount: %O", output.amount);
      let outputs = this.wasm.TransactionOutputs.new();
      outputs.add(
        this.wasm.TransactionOutput.new(
          this.wasm.Address.from_bech32(params.crossScAddr),
          this.tool.assetsToValue(output.amount)
        )
      );
      let utxos = await wallet.getUtxos(); // hex
      // this.tool.showUtxos(utxos, "all");
      let selected = await this.selectUtxos(utxos, outputs, epochParameters);
      let inputs = selected.map(v => this.wasm.TransactionUnspentOutput.from_hex(v));
      console.debug("ProcessAdaMintFromCardano select %d inputs from %d utxos", inputs.length, utxos.length);
      // this.tool.showUtxos(inputs, "cc selected");

      let metaData = await this.buildUserBurnData(params.tokenPairID, params.userAccount, params.storemanGroupId);
      let mintBuilder = this.buildMint(tool.ascii2letter(tool.hexStrip0x(tokenPair.toAccount)), params.value);
      let collateralBuilder = await this.buildCollateral(wallet);

      let tx = await this.buildTx(params.fromAddr, inputs, outputs, epochParameters, metaData, mintBuilder, collateralBuilder);

      // sign and send
      let txHash = await wallet.sendTransaction(tx, params.fromAddr);
      webStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, stepData.stepIndex, txHash, ""); // only update txHash, no result

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
      console.error("ProcessBurnFromCardano error: %O", err);
      if (err.info === "User declined to sign the transaction.") { // code 2 include other errors
        webStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Rejected");
      } else {
        webStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Failed", tool.getErrMsg(err, "Failed to send transaction"));
      }
    }
  }

  async selectUtxos(hexUtxos, outputs, epochParameters) {
    let url = this.apiServerUrl + "/api/adaHelper/selectUtxos";
    let hexOutputs = [];
    for (let i = 0; i < outputs.len(); i ++) {
      hexOutputs.push(outputs.get(i).to_hex());
    }
    let protocolParameters = {
      coinsPerUtxoWord: epochParameters.coinsPerUtxoWord,
      linearFee: epochParameters.linearFee,
      maxTxSize: epochParameters.maxTxSize
    }
    try {
      let ret = await axios.post(url, {hexUtxos, hexOutputs, protocolParameters});
      console.debug("ProcessBurnFromCardano selectUtxos %s: %O", url, ret.data);
      return ret.data || [];
    } catch (err) {
      console.error("ProcessBurnFromCardano selectUtxos error: %O", err);
      return [];
    }
  }

  buildUserBurnData(tokenPairID, toAccount, smgID) {
    let data = {
      1: {
        type: TX_TYPE.userBurn,
        tokenPairID: Number(tokenPairID),
        toAccount,
        smgID
      }
    };
    // console.debug("ProcessBurnFromCardano buildUserBurnData: %O", data);
    data = this.wasm.encode_json_str_to_metadatum(JSON.stringify(data), this.wasm.MetadataJsonSchema.BasicConversions);
    return this.wasm.GeneralTransactionMetadata.from_bytes(data.to_bytes());
  }

  async buildCostModels() {
    let parameters = await this.storemanService.getCardanoCostModelParameters();
    let costModels = parameters.costModels;

    const v1 = this.wasm.CostModel.new();
    let index = 0;
    for (let key in costModels['plutus:v1']) {
        v1.set(index, this.wasm.Int.new_i32(costModels['plutus:v1'][key]));
        index++;
    }

    const v2 = this.wasm.CostModel.new();
    index = 0;
    for (let key in costModels['plutus:v2']) {
        v2.set(index, this.wasm.Int.new_i32(costModels['plutus:v2'][key]));
        index++;
    }
    let result = this.wasm.Costmdls.new();
    result.insert(this.wasm.Language.new_plutus_v1(), v1);
    result.insert(this.wasm.Language.new_plutus_v2(), v2);
    console.log("buildCostModels: %O", result.to_js_value());
    return result;
  }

  async buildCollateral(wallet) {
    const utxos = await wallet.getCollateral();
    console.debug("buildCollateral get %d utxos", utxos.length);
    const builder = this.wasm.TxInputsBuilder.new();
    for (let utxo of utxos) {
      builder.add_input(
        utxo.output().address(),
        utxo.input(),
        utxo.output().amount()
      );
    }
    return builder;
  }

  buildMint(tokenId, burnedAmount) {
    const wasm = this.wasm;
    const chainInfoService = this.frameworkService.getService("ChainInfoService");
    const chainInfo = chainInfoService.getChainInfoByType("ADA");
    const scriptRefInput = wasm.TransactionInput.new(
      wasm.TransactionHash.from_hex(chainInfo.tokenScript.txHash),
      chainInfo.tokenScript.index
    );
    const tokenScript = wasm.PlutusScript.from_bytes_v2(Buffer.from(chainInfo.tokenScript.cborHex, 'hex'));
    const plutusScriptSource = wasm.PlutusScriptSource.new_ref_input_with_lang_ver(tokenScript.hash(), scriptRefInput, wasm.Language.new_plutus_v2());

    const exUnitsMint = wasm.ExUnits.new(
      wasm.BigNum.from_str("2136910"),  //(EX_UNIT_A),//TODO----->903197
      wasm.BigNum.from_str("634469356") //(EX_UNIT_B)306405352
    );
    const mintRedeemer = wasm.Redeemer.new(
      wasm.RedeemerTag.new_mint(),
      wasm.BigNum.from_str('0'),
      wasm.PlutusData.new_empty_constr_plutus_data(wasm.BigNum.from_str('0')),
      exUnitsMint
    );
    const witness = wasm.MintWitness.new_plutus_script(plutusScriptSource, mintRedeemer);

    const assetName = wasm.AssetName.new(Buffer.from(tokenId.split(".")[1], 'hex'));
    const builder = wasm.MintBuilder.new();
    builder.add_asset(witness, assetName, wasm.Int.from_str('-' + burnedAmount));
    return builder;
  }

  async buildTx(paymentAddr, inputs, outputs, epochParameters, metaData, mintBuilder, collateralBuilder) {
    const wasm = this.wasm;
    const txBuilderConfig = wasm.TransactionBuilderConfigBuilder.new()
    .coins_per_utxo_byte(
      wasm.BigNum.from_str(epochParameters.coinsPerUtxoByte)
    )
    .fee_algo(
      wasm.LinearFee.new(
        wasm.BigNum.from_str(epochParameters.linearFee.minFeeA),
        wasm.BigNum.from_str(epochParameters.linearFee.minFeeB)
      )
    )
    .key_deposit(wasm.BigNum.from_str(epochParameters.keyDeposit))
    .pool_deposit(
      wasm.BigNum.from_str(epochParameters.poolDeposit)
    )
    .max_tx_size(epochParameters.maxTxSize)
    .max_value_size(epochParameters.maxValSize)
    .ex_unit_prices(wasm.ExUnitPrices.new(
      wasm.UnitInterval.new(wasm.BigNum.from_str("0"), wasm.BigNum.from_str("1")),
      wasm.UnitInterval.new(wasm.BigNum.from_str("0"), wasm.BigNum.from_str("1"))
    ))
    // .collateral_percentage(epochParameters.collateralPercentage)
    // .max_collateral_inputs(epochParameters.maxCollateralInputs)
    .build();

    let txBuilder = wasm.TransactionBuilder.new(txBuilderConfig);

    for (let utxo of inputs) {
      txBuilder.add_input(
        utxo.output().address(),
        utxo.input(),
        utxo.output().amount()
      );
    }

    let auxiliaryData = wasm.AuxiliaryData.new();
    auxiliaryData.set_metadata(metaData);
    txBuilder.set_auxiliary_data(auxiliaryData);

    let output = outputs.get(0);
    output.set_plutus_data(this.tool.genPlutusData());
    txBuilder.add_output(output);

    txBuilder.set_mint_builder(mintBuilder);

    let costModels = await this.buildCostModels();
    txBuilder.calc_script_data_hash(costModels);

    let selfAddress = wasm.Address.from_bech32(paymentAddr);

    txBuilder.set_collateral(collateralBuilder);
    console.log("set_total_collateral_and_return")
    txBuilder.set_total_collateral_and_return(txBuilder.min_fee().checked_mul(this.wasm.BigNum.from_str('2')), selfAddress);

    txBuilder.set_ttl(epochParameters.slot + (3600 * 2)); // 2h from current slot

    console.log("add_change_if_needed")
    txBuilder.add_change_if_needed(selfAddress);

    console.log("wasm.Transaction.new")
    const transaction = wasm.Transaction.new(
      txBuilder.build(),
      wasm.TransactionWitnessSet.new(),
      auxiliaryData
    );
  
    console.log("transaction: %O", transaction.to_js_value())
    return transaction;
  }
};