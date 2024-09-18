'use strict';

const BigNumber = require("bignumber.js");
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
  userLock:   1,
  smgRelease: 2,
  smgDebt:    5,
  smgProxy:   6,
  smgPhaDebt: 7,
  userBurn:   8,
  smgMint:    9,
  invalid:   -1
};

module.exports = class ProcessAdaMintFromCardano {
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
    //console.debug("ProcessAdaMintFromCardano stepData:", stepData);
    let params = stepData.params;
    try {
      let epochParameters = await this.storemanService.getCardanoEpochParameters();
      let tokenPairService = this.frameworkService.getService("TokenPairService");
      let tokenPair = tokenPairService.getTokenPair(params.tokenPairID);
      let isCoin = (tokenPair.fromAccount === "0x0000000000000000000000000000000000000000");
      let crossValue = isCoin? new BigNumber(params.value).minus(params.networkFee).toFixed(0) : params.value;
      let output = {
        address: params.crossScAddr,
        amount: [
          {
            unit: 'lovelace',
            quantity: isCoin? crossValue : '10000000' // actual or probable locked quantity
          }
        ]
      };
      if (!isCoin) { // for token, to construct multiassets and calculate minAda to lock
        output.amount.push({
          unit: tool.ascii2letter(tool.hexStrip0x(tokenPair.fromAccount)).replace(/\./g, ""), // policyId(28 bytes) + "." + name
          quantity: crossValue
        });
        let tempTxOutput = this.wasm.TransactionOutput.new(
          this.wasm.Address.from_bech32(params.crossScAddr),
          this.tool.assetsToValue(output.amount)
        );
        tempTxOutput.set_plutus_data(this.tool.genPlutusData());
        let minAda = this.tool.minAdaRequired(tempTxOutput, epochParameters.coinsPerUtxoByte);
        output.amount[0].quantity = minAda;
      }
      let txOutput = this.wasm.TransactionOutput.new(
        this.wasm.Address.from_bech32(params.crossScAddr),
        this.tool.assetsToValue(output.amount)
      );

      let utxos = await wallet.getUtxos();
      if (utxos.length === 0) {
        throw new Error("No available utxos");
      }
      utxos = utxos.map(v => this.wasm.TransactionUnspentOutput.from_hex(v));
      output.amount[0].quantity = new BigNumber(output.amount[0].quantity).plus(params.networkFee).plus("1000000").toFixed(); // add network and gas fee to select utxos
      console.debug("cardano mint tx select output: %O", output);
      let inputs = this.tool.selectUtxos(utxos, output, epochParameters);
      console.log("ProcessAdaMintFromCardano select %d inputs from %d utxos", inputs.length, utxos.length);
      if (inputs.length) {
        this.tool.showUtxos(inputs, "mint tx input");
        let checkUtxos = await this.tool.checkUtxos(this.network, inputs, 10000);
        if (!checkUtxos) {
          throw new Error("UTXOs unavailable, please try again later");
        }
      } else {
        this.tool.showUtxos(utxos, "mint tx wallet");
        throw new Error("Not enough utxos");
      }

      let metaData = await this.buildMetadata(params.tokenPairID, params.fromAddr, params.userAccount, params.storemanGroupId);

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

      let tx = this.buildTx(params.fromAddr, inputs, txOutput, networkFeeOutput, epochParameters, metaData);
      console.debug("ProcessAdaMintFromCardano tx: %O", tx.to_json());

      // sign and send
      let txHash = await wallet.sendTransaction(tx.to_hex(), params.fromAddr);
      webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, txHash, ""); // only update txHash, no result

      // check receipt
      let direction = (tokenPair.fromChainType === "ADA")? "MINT" : "BURN";
      let checkPara = {
        ccTaskId: params.ccTaskId,
        stepIndex: stepData.stepIndex,
        fromBlockNumber: await this.storemanService.getChainBlockNumber(params.toChainType),
        txHash,
        chain: params.toChainType,
        smgPublicKey: params.storemanGroupGpk,
        taskType: tokenPairService.getTokenEventType(params.tokenPairID, direction)
      };

      let checkAdaTxService = this.frameworkService.getService("CheckAdaTxService");
      await checkAdaTxService.addTask(checkPara);
    } catch (err) {
      if (["User declined to sign the transaction.", "User rejected", "user declined to sign tx"].includes(err.info)) { // code 2 include other errors
        webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Rejected");
      } else {
        console.error("ProcessAdaMintFromCardano error: %O", err);
        webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Failed", tool.getErrMsg(err, "Failed to send transaction"));
      }
    }
  }

  buildMetadata(tokenPairID, fromAccount, toAccount, smgID) {
    let data = {
      1: {
        type: TX_TYPE.userLock,
        tokenPairID: Number(tokenPairID),
        fromAccount: this.tool.splitMetadata(fromAccount),
        toAccount,
        smgID
      }
    };
    // console.debug("ProcessAdaMintFromCardano buildMetadata: %O", data);
    data = this.wasm.encode_json_str_to_metadatum(JSON.stringify(data), this.wasm.MetadataJsonSchema.BasicConversions);
    return this.wasm.GeneralTransactionMetadata.from_bytes(data.to_bytes());
  }

  buildTx(paymentAddr, inputs, output, networkFeeOutput, epochParameters, metaData) {
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
      txBuilder.add_regular_input(
        utxo.output().address(),
        utxo.input(),
        utxo.output().amount()
      );
    }

    let auxiliaryData = this.wasm.AuxiliaryData.new();
    auxiliaryData.set_metadata(metaData);
    txBuilder.set_auxiliary_data(auxiliaryData);

    output.set_plutus_data(this.tool.genPlutusData());
    txBuilder.add_output(output);
    if (networkFeeOutput) {
      txBuilder.add_output(networkFeeOutput);
    }

    txBuilder.set_ttl(epochParameters.slot + (3600 * 6)); // 6h from current slot
    txBuilder.add_change_if_needed(
      wasm.Address.from_bech32(paymentAddr)
    );

    const transaction = txBuilder.build_tx();
    return transaction;
  }
};