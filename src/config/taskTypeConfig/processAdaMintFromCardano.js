'use strict';

const BigNumber = require("bignumber.js");
const wasm = require("@emurgo/cardano-serialization-lib-asmjs");

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
      let storemanGroupAddr = "addr_test1qz3ga6xtwkxn2aevf8jv0ygpq3cpseen68mcuz2fqe3lu0s9ag8xf2vwvdxtt6su2pn6h7rlnnnsqweavyqgd2ru3l3q09lq9e"; // await wallet.longPubKeyToAddress(params.storemanGroupGpk);
      console.debug("ProcessAdaMintFromCardano storemanGroupAddr: %s", storemanGroupAddr);

      let protocolParameters = await this.initTx();
      let utxos = await wallet.cardano.getUtxos();
      utxos = utxos.map(utxo => wasm.TransactionUnspentOutput.from_bytes(Buffer.from(utxo, 'hex')));
      // console.debug({utxos});
      let outputs = wasm.TransactionOutputs.new();
      outputs.add(
        wasm.TransactionOutput.new(
          wasm.Address.from_bech32(storemanGroupAddr),
          wasm.Value.new(
            wasm.BigNum.from_str(new BigNumber(params.value).toFixed())
          )
        )
      );
      let metaData = await wallet.buildUserLockData(params.tokenPairID, params.userAccount, params.fee);
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
      minUtxo: p.min_utxo, //p.min_utxo, minUTxOValue protocol paramter has been removed since Alonzo HF. Calulation of minADA works differently now, but 1 minADA still sufficient for now
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
};