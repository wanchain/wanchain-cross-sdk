'use strict';

const BigNumber = require("bignumber.js");
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
    this.network = configService.getNetwork();
  }

  async process(stepData, wallet) {
    let webStores = this.frameworkService.getService("WebStores");
    // console.debug("ProcessBurnFromCardano stepData:", stepData);
    let params = stepData.params;
    try {
      // check collateral at first
      let collateralBuilder = await this.buildCollateral(wallet);

      let [epochParameters, costModelParameters] = await Promise.all([
        this.storemanService.getCardanoEpochParameters(),
        this.storemanService.getCardanoCostModelParameters()
      ]);
      let tokenPairService = this.frameworkService.getService("TokenPairService");
      let tokenPair = tokenPairService.getTokenPair(params.tokenPairID);
      let output = {
        address: params.crossScAddr,
        amount: [
          {
            unit: 'lovelace',
            quantity: '10000000' // actual or probable locked quantity
          }
        ]
      };      
      // for token, to construct multiassets and calculate minAda to lock
      let tokenAccount = (tokenPair.fromChainType === "ADA")? tokenPair.fromAccount : tokenPair.toAccount;
      let tokenId = tool.ascii2letter(tool.hexStrip0x(tokenAccount));
      output.amount.push({
        unit: tokenId.replace(/\./g, ""), // policyId(28 bytes) + "." + name
        quantity: params.value
      });
      let tempTxOutput = this.wasm.TransactionOutput.new(
        this.wasm.Address.from_bech32(params.crossScAddr),
        this.tool.assetsToValue(output.amount)
      );
      let minAda = this.tool.minAdaRequired(tempTxOutput, epochParameters.coinsPerUtxoByte);
      output.amount[0].quantity = minAda;

      let utxos = await wallet.getUtxos();
      if (utxos.length === 0) {
        throw new Error("No available utxos");
      }
      utxos = utxos.map(v => this.wasm.TransactionUnspentOutput.from_hex(v));
      output.amount[0].quantity = new BigNumber(output.amount[0].quantity).plus(params.networkFee).plus("2000000").toFixed(); // add fee to select utxos
      console.debug("cardano burn tx select output: %O", output);
      let inputs = this.tool.selectUtxos(utxos, output, epochParameters);
      console.log("ProcessBurnFromCardano select %d inputs from %d utxos", inputs.length, utxos.length);
      if (inputs.length) {
        this.tool.showUtxos(inputs, "burn tx input");
        let checkUtxos = await this.tool.checkUtxos(this.network, inputs, 10000);
        if (!checkUtxos) {
          throw new Error("UTXOs unavailable, please try again later");
        }
      } else {
        this.tool.showUtxos(utxos, "burn tx wallet");
        throw new Error("Not enough utxos");
      }

      let metaData = this.buildMetadata(params.tokenPairID, params.fromAddr, params.userAccount, params.storemanGroupId);
      let mintBuilder = this.buildMint(tokenId, params.value);

      let networkFeeOutput = null;
      if (params.networkFee != 0) {
        networkFeeOutput = this.wasm.TransactionOutput.new(
          this.wasm.Address.from_bech32(params.feeHolder),
          this.tool.assetsToValue([{
            unit: 'lovelace',
            quantity: params.networkFee
          }])
        );
      }

      let tx = await this.buildTx(params.fromAddr, inputs, networkFeeOutput, epochParameters, costModelParameters, metaData, mintBuilder, collateralBuilder);
      console.debug("ProcessBurnFromCardano evaluateTx: %O", tx.to_json());

      let evaluateTx = await this.tool.evaluateTx(this.network, tx.to_hex());
      let executionUnits = evaluateTx["mint:0"];
      if (executionUnits) {
        console.debug("executionUnits: %O", executionUnits);
      } else {
        console.error("evaluateTx: %O", evaluateTx);
        throw new Error("Failed to evaluate tx, please try again later");
      }
      if ((executionUnits.memory > costModelParameters.maxExecutionUnitsPerTransaction.memory)
          || (executionUnits.steps > costModelParameters.maxExecutionUnitsPerTransaction.steps)) {
        throw new Error("The execution units exceed the maximum limit, it is recommended to merge utxos");
      }

      // rebuild tx
      mintBuilder = this.buildMint(tokenId, params.value, executionUnits);
      tx = await this.buildTx(params.fromAddr, inputs, networkFeeOutput, epochParameters, costModelParameters, metaData, mintBuilder, collateralBuilder);

      // sign and send
      let txHash = await wallet.sendTransaction(tx.to_hex(), params.fromAddr);
      webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, txHash, ""); // only update txHash, no result

      // check receipt
      let direction = (tokenPair.fromChainType === "ADA")? "MINT" : "BURN";
      let taskType = tokenPairService.getTokenEventType(params.tokenPairID, direction);
      let checkPara = {
        ccTaskId: params.ccTaskId,
        stepIndex: stepData.stepIndex,
        fromBlockNumber: await this.storemanService.getChainBlockNumber(params.toChainType),
        txHash,
        chain: params.toChainType,
        smgPublicKey: params.storemanGroupGpk,
        taskType,
        fromAddr: params.fromAddr,
        toAddr: params.userAccount
      };

      let checkAdaTxService = this.frameworkService.getService("CheckAdaTxService");
      await checkAdaTxService.addTask(checkPara);
    } catch (err) {
      console.error("ProcessBurnFromCardano error: %O", err);
      if (["User declined to sign the transaction.", "User rejected", "user declined to sign tx"].includes(err.info)) { // code 2 include other errors
        webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Rejected");
      } else {
        webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Failed", tool.getErrMsg(err, "Failed to send transaction"));
      }
    }
  }

  buildMetadata(tokenPairID, fromAccount, toAccount, smgID) {
    let data = {
      1: {
        type: TX_TYPE.userBurn,
        tokenPairID: Number(tokenPairID),
        fromAccount: this.tool.splitMetadata(fromAccount),
        toAccount,
        smgID
      }
    };
    // console.debug("ProcessBurnFromCardano buildMetadata: %O", data);
    data = this.wasm.encode_json_str_to_metadatum(JSON.stringify(data), this.wasm.MetadataJsonSchema.BasicConversions);
    return this.wasm.GeneralTransactionMetadata.from_bytes(data.to_bytes());
  }

  async buildCostModels(costModelParameters) {
    let costModels = costModelParameters.costModels;
    const v1 = this.wasm.CostModel.new();
    let index = 0;
    for (let key in costModels['PlutusV1']) {
      v1.set(index, this.wasm.Int.new_i32(costModels['PlutusV1'][key]));
      index++;
    }
    const v2 = this.wasm.CostModel.new();
    index = 0;
    for (let key in costModels['PlutusV2']) {
      v2.set(index, this.wasm.Int.new_i32(costModels['PlutusV2'][key]));
      index++;
    }
    const v3 = this.wasm.CostModel.new();
    index = 0;
    for (let key in costModels['PlutusV3']) {
      v3.set(index, this.wasm.Int.new_i32(costModels['PlutusV3'][key]));
      index++;
    }
    let result = this.wasm.Costmdls.new();
    result.insert(this.wasm.Language.new_plutus_v1(), v1);
    result.insert(this.wasm.Language.new_plutus_v2(), v2);
    result.insert(this.wasm.Language.new_plutus_v3(), v3);
    console.log("buildCostModels: %O", result.to_js_value());
    return result;
  }

  async buildCollateral(wallet) {
    let utxos = await wallet.getCollateral();
    if (utxos.length) {
      console.log("get %d collateral utxos", utxos.length);
      utxos = utxos.map(v => this.wasm.TransactionUnspentOutput.from_hex(v));
      this.tool.showUtxos(utxos, "burn tx collateral");
      let checkUtxos = await this.tool.checkUtxos(this.network, utxos, 120000);
      if (!checkUtxos) {
        throw new Error("Collateral utxos unavailable, please try again later");
      }
    } else {
      throw new Error("No collateral utxos");
    }
    const builder = this.wasm.TxInputsBuilder.new();
    for (let utxo of utxos) {
      builder.add_regular_input(
        utxo.output().address(),
        utxo.input(),
        utxo.output().amount()
      );
    }
    return builder;
  }

  buildMint(tokenId, burnedAmount, executionUnits = undefined) {
    const wasm = this.wasm;
    const chainInfoService = this.frameworkService.getService("ChainInfoService");
    const chainInfo = chainInfoService.getChainInfoByType("ADA");
    const scriptRefInput = wasm.TransactionInput.new(
      wasm.TransactionHash.from_hex(chainInfo.tokenScript.txHash),
      chainInfo.tokenScript.index
    );
    const plutusScript = wasm.PlutusScript.from_bytes_v2(Buffer.from(chainInfo.tokenScript.cborHex, 'hex'));
    const plutusScriptSource = wasm.PlutusScriptSource.new_ref_input(plutusScript.hash(), scriptRefInput, wasm.Language.new_plutus_v2(), plutusScript.bytes().length);

    const exUnitsMint = wasm.ExUnits.new(
      wasm.BigNum.from_str(executionUnits? executionUnits.memory.toString() : "2136910"),
      wasm.BigNum.from_str(executionUnits? executionUnits.steps.toString() : "634469356")
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

  async buildTx(paymentAddr, inputs, networkFeeOutput, epochParameters, costModelParameters, metaData, mintBuilder, collateralBuilder) {
    const wasm = this.wasm;
    const priceMem = epochParameters.priceMem.replace(/\"/g, "").split("/");
    const priceStep = epochParameters.priceStep.replace(/\"/g, "").split("/");
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
      wasm.UnitInterval.new(wasm.BigNum.from_str(priceMem[0]), wasm.BigNum.from_str(priceMem[1])),
      wasm.UnitInterval.new(wasm.BigNum.from_str(priceStep[0]), wasm.BigNum.from_str(priceStep[1]))
    ))
    .ref_script_coins_per_byte(wasm.UnitInterval.new(wasm.BigNum.from_str(epochParameters.minFeeRefScriptCostPerByte), wasm.BigNum.from_str('1')))
    // .collateral_percentage(epochParameters.collateralPercentage)
    // .max_collateral_inputs(epochParameters.maxCollateralInputs)
    .build();

    let txBuilder = wasm.TransactionBuilder.new(txBuilderConfig);

    for (let utxo of inputs) {
      txBuilder.add_regular_input(
        utxo.output().address(),
        utxo.input(),
        utxo.output().amount()
      );
    }

    let auxiliaryData = wasm.AuxiliaryData.new();
    auxiliaryData.set_metadata(metaData);
    txBuilder.set_auxiliary_data(auxiliaryData);

    txBuilder.set_mint_builder(mintBuilder);

    let costModels = await this.buildCostModels(costModelParameters);
    txBuilder.calc_script_data_hash(costModels);

    let selfAddress = wasm.Address.from_bech32(paymentAddr);

    txBuilder.set_collateral(collateralBuilder);
    txBuilder.set_total_collateral_and_return(txBuilder.min_fee().checked_mul(this.wasm.BigNum.from_str('2')), selfAddress);

    if (networkFeeOutput) {
      txBuilder.add_output(networkFeeOutput);
    }

    txBuilder.set_ttl(epochParameters.slot + (3600 * 6)); // 6h from current slot
    txBuilder.add_change_if_needed(selfAddress);

    const transaction = txBuilder.build_tx();
    return transaction;
  }
};