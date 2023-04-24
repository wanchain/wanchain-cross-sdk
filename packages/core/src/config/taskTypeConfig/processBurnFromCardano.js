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
      // fix FeeTooSmallUTxO
      epochParameters.linearFee.minFeeA = (epochParameters.linearFee.minFeeA * 2).toString();
      epochParameters.linearFee.minFeeB = (epochParameters.linearFee.minFeeB * 2).toString();

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
      let tokenId = tool.ascii2letter(tool.hexStrip0x(tokenPair.toAccount));
      output.amount.push({
        unit: tokenId.replace(/\./g, ""), // policyId(28 bytes) + "." + name
        quantity: params.value
      });

      let tempOutput = this.wasm.TransactionOutput.new(
        this.wasm.Address.from_bech32(params.crossScAddr),
        this.tool.assetsToValue(output.amount)
      );
      let minAda = this.tool.minAdaRequired(tempOutput, epochParameters.coinsPerUtxoByte);
      console.debug({minAda});
      output.amount[0].quantity = minAda;

      let txOutput = this.wasm.TransactionOutput.new(
        this.wasm.Address.from_bech32(params.crossScAddr),
        this.tool.assetsToValue(output.amount)
      );

      let utxos = await wallet.getUtxos(); // hex
      // this.tool.showUtxos(utxos, "all");
      if (utxos.length === 0) {
        throw new Error("No utxo available");
      }

      let inputs = this.tool.selectUtxos(utxos, txOutput, epochParameters);
      if (inputs.length === 0) {
        throw new Error("Not enough utxo available");
      }
      console.debug("ProcessBurnFromCardano select %d inputs from %d utxos", inputs.length, utxos.length);
      // this.tool.showUtxos(inputs, "inputs");

      let metaData = this.buildMetadata(params.tokenPairID, params.userAccount, params.storemanGroupId);
      let mintBuilder = this.buildMint(tokenId, params.value);
      let collateralBuilder = await this.buildCollateral(wallet);
      let tx = await this.buildTx(params.fromAddr, inputs, epochParameters, metaData, mintBuilder, collateralBuilder);
      console.debug("ProcessBurnFromCardano tx: %O", tx.to_json());

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
        taskType: "BURN"
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

  buildMetadata(tokenPairID, toAccount, smgID) {
    let data = {
      1: {
        type: TX_TYPE.userBurn,
        tokenPairID: Number(tokenPairID),
        toAccount,
        smgID
      }
    };
    // console.debug("ProcessBurnFromCardano buildMetadata: %O", data);
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
    const plutusScript = wasm.PlutusScript.from_bytes_v2(Buffer.from(chainInfo.tokenScript.cborHex, 'hex'));
    const plutusScriptSource = wasm.PlutusScriptSource.new_ref_input_with_lang_ver(plutusScript.hash(), scriptRefInput, wasm.Language.new_plutus_v2());

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

  async buildTx(paymentAddr, inputs, epochParameters, metaData, mintBuilder, collateralBuilder) {
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

    txBuilder.set_mint_builder(mintBuilder);

    let costModels = await this.buildCostModels();
    txBuilder.calc_script_data_hash(costModels);

    let selfAddress = wasm.Address.from_bech32(paymentAddr);

    txBuilder.set_collateral(collateralBuilder);
    txBuilder.set_total_collateral_and_return(txBuilder.min_fee().checked_mul(this.wasm.BigNum.from_str('2')), selfAddress);

    txBuilder.set_ttl(epochParameters.slot + (3600 * 6)); // 6h from current slot
    txBuilder.add_change_if_needed(selfAddress);

    const transaction = txBuilder.build_tx();
    return transaction;
  }
};