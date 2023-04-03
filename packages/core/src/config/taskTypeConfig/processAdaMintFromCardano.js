'use strict';

const axios = require("axios");
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
      let output = {
        address: this.wasm.Address.from_bech32(params.crossScAddr),
        amount: [
          {
            unit: 'lovelace',
            quantity: isCoin? params.value : '10000000' // actual or probable locked quantity
          }
        ]
      };
      if (!isCoin) { // for token, to construct multiassets and calculate minAda to lock
        output.amount.push({
          unit: tool.ascii2letter(tool.hexStrip0x(tokenPair.fromAccount)).replace(/\./g, ""), // policyId(28 bytes) + "." + name
          quantity: params.value
        });
        let outputValue = this.tool.assetsToValue(output.amount);
        let minAda = this.tool.minAdaRequired(
          outputValue,
          this.wasm.BigNum.from_str(
            epochParameters.coinsPerUtxoWord
          ),
          epochParameters.minUtxo
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

      let utxos = await wallet.getUtxos(); // hex
      // this.tool.showUtxos(utxos, "all");
      let selected = await this.selectUtxos(utxos, outputs, epochParameters);
      let inputs = selected.map(v => this.wasm.TransactionUnspentOutput.from_hex(v));
      console.debug("ProcessAdaMintFromCardano select %d inputs from %d utxos", inputs.length, utxos.length);
      // this.tool.showUtxos(inputs, "selected");

      let metaData = await this.buildUserLockData(params.tokenPairID, params.userAccount, params.storemanGroupId);

      let tx = this.buildTx(params.fromAddr, inputs, outputs, epochParameters, metaData);

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
      console.error("ProcessAdaMintFromCardano error: %O", err);
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
      console.debug("ProcessAdaMintFromCardano selectUtxos %s: %O", url, ret.data);
      return ret.data || [];
    } catch (err) {
      console.error("ProcessAdaMintFromCardano selectUtxos error: %O", err);
      return [];
    }
  }

  buildUserLockData(tokenPairID, toAccount, smgID) {
    let data = {
      1: {
        type: TX_TYPE.userLock,
        tokenPairID: Number(tokenPairID),
        toAccount,
        smgID
      }
    };
    // console.debug("ProcessAdaMintFromCardano buildUserLockData: %O", data);
    data = this.wasm.encode_json_str_to_metadatum(JSON.stringify(data), this.wasm.MetadataJsonSchema.BasicConversions);
    return this.wasm.GeneralTransactionMetadata.from_bytes(data.to_bytes());
  }

  buildTx(paymentAddr, inputs, outputs, epochParameters, metaData) {
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

    let auxiliaryData = this.wasm.AuxiliaryData.new();
    auxiliaryData.set_metadata(metaData);
    txBuilder.set_auxiliary_data(auxiliaryData);

    let output = outputs.get(0);
    output.set_plutus_data(this.tool.genPlutusData());
    txBuilder.add_output(output);

    txBuilder.set_ttl(epochParameters.slot + (3600 * 2)); // 2h from current slot
    txBuilder.add_change_if_needed(
      wasm.Address.from_bech32(paymentAddr)
    );

    const transaction = txBuilder.build_tx();
    return transaction;
  }
};