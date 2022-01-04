'use strict';

const BigNumber = require("bignumber.js");
const wasm = require("@emurgo/cardano-serialization-lib-asmjs");

module.exports = class ProcessAdaMintFromCardano {
  constructor(frameworkService) {
    this.m_frameworkService = frameworkService;
  }

  async process(stepData, wallet) {
    let webStores = this.m_frameworkService.getService("WebStores");
    //console.debug("ProcessAdaMintFromCardano stepData:", stepData);
    let params = stepData.params;
    try {
      let storemanGroupAddr = "addr_test1qz3ga6xtwkxn2aevf8jv0ygpq3cpseen68mcuz2fqe3lu0s9ag8xf2vwvdxtt6su2pn6h7rlnnnsqweavyqgd2ru3l3q09lq9e"; // await wallet.longPubKeyToAddress(params.storemanGroupGpk);
      console.debug("storemanGroupAddr:", storemanGroupAddr);

      let protocolParameters = await wallet.initTx();
      let utxos = await wallet.cardano.getUtxos();
      utxos = utxos.map(utxo => wasm.TransactionUnspentOutput.from_bytes(Buffer.from(utxo, 'hex')));
      console.log({utxos});
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
      let tx = await wallet.buildTx(params.fromAddr, utxos, outputs, protocolParameters, auxiliaryData);
      
      // check balance >= (value + gasFee)
      let balance = await wallet.getBalance(params.fromAddr);
      let gasFee = tx.body().fee().to_str();
      console.log({gasFee});
      let chainInfoService = this.m_frameworkService.getService("ChainInfoService");
      let chainInfo = await chainInfoService.getChainInfoByType("ADA");
      if (new BigNumber(params.value).plus(gasFee).gt(balance)) {
        console.error("ProcessAdaMintFromCardano insufficient balance, gasFee: %s", gasFee.div(Math.pow(10, chainInfo.chainDecimals)).toFixed());
        webStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Failed", "Insufficient balance");
        return;
      }

      // sign and send
      let txHash;
      try {
        txHash = await wallet.sendTransaction(tx, params.fromAddr);
        webStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, stepData.stepIndex, txHash, ""); // only update txHash, no result
      } catch (err) {
        if (err.code === 2) { // info: "User declined to sign the transaction."
          webStores["crossChainTaskSteps"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Rejected");
        } else {
          console.error("cardano sendTransaction error: %O", err);
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
};