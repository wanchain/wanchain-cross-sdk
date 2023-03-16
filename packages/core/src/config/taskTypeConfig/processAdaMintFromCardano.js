'use strict';

const tool = require("../../utils/tool.js");

/* metadata format:
  userLock:
  {
    type: 1,             // number
    tokenPairID: 1,      // number
    toAccount: 0x...,    // string
    smgID: 0x...         // string
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
  smgProxy:   6,
  smgPhaDebt: 7,
  userBurn:   8,
  smgMint:    9,
  Invalid:   -1
};

module.exports = class ProcessAdaMintFromCardano {
  constructor(frameworkService) {
    this.frameworkService = frameworkService;
    let configService = frameworkService.getService("ConfigService");
    let extension = configService.getExtension("ADA");
    this.tool = extension.tool;
    this.wasm = extension.wasm;
  }

  async process(stepData, wallet) {
    let webStores = this.frameworkService.getService("WebStores");
    //console.debug("ProcessAdaMintFromCardano stepData:", stepData);
    let params = stepData.params;
    try {
      let storemanService = this.frameworkService.getService("StoremanService");
      let epochParameters = await storemanService.getCardanoEpochParameters();
      let utxos = await wallet.getUtxos();
      this.tool.showUtxos(utxos);

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
          unit: tool.hexStrip0x(tokenPair.fromAccount), // policyId(28 bytes) + name
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
      }
      // console.log("output.amount: %O", output.amount);
      let outputs = this.wasm.TransactionOutputs.new();
      outputs.add(
        this.wasm.TransactionOutput.new(
          this.wasm.Address.from_bech32(params.crossScAddr),
          this.tool.assetsToValue(output.amount)
        )
      );

      let metaData = await this.buildUserLockData(params.tokenPairID, params.userAccount, params.storemanGroupId);
      let auxiliaryData = this.wasm.AuxiliaryData.new();
      auxiliaryData.set_metadata(metaData);

      let plutusData = this.tool.genPlutusData();

      let tx;
      try {
        tx = await this.buildTx(params.fromAddr, utxos, outputs, epochParameters, auxiliaryData, plutusData);
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

  async buildTx(paymentAddr, utxos, outputs, epochParameters, auxiliaryData, plutusData) {
    const inputs = await this.tool.selectUtxos(utxos, outputs, epochParameters);
    console.debug("ProcessAdaMintFromCardano select %d inputs from %d utxos", inputs.length, utxos.length);

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
  
    txBuilder.set_ttl(epochParameters.slot + (3600 * 2)); // 2h from current slot
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
};