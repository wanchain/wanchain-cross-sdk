const { ContractSdk } = require("cardano-contract-sdk/sdk.js");
const { evaluateTx } = require("cardano-contract-sdk/ogmios-utils.js");
const BigNumber = require("bignumber.js");
const tool = require("./tool");

class Signer {
  constructor(network, wallet) {
    this.network = network; // "testnet" or "mainnet"
    this.sdk = new ContractSdk(network === "mainnet");
    this.wallet = wallet;
  }

  async init(host, port, tls) {
    let networkId = await this.wallet.getChainId();
    if (((this.network === "mainnet") && (networkId != 1))
       || ((this.network === "testnet") && (networkId != 0))) {
      throw new Error("Wrong network");
    }
    await this.sdk.init(host, port, tls);
  }

  // TX Signatures

  async signTx(hexData) {
    let data = JSON.parse(hexData);
    console.debug("Cardano Signer: signTx, data: %O", data);
    let wasm = tool.getWasm();
    let tx = wasm.Transaction.from_hex(data.tx);
    let latestWitnessSet = data.witnessSet? wasm.TransactionWitnessSet.from_hex(data.witnessSet) : null;
    let result = await this._sign(data.function, data.paras, data.signers, tx, latestWitnessSet);
    return result;
  }

  async submitTx(hexData, onlyEvaluateTx = false) {
    let data = JSON.parse(hexData);
    console.debug("Cardano Signer: submitTx, data: %O", data);
    let wasm = tool.getWasm();
    let tx = wasm.Transaction.from_hex(data.tx);
    let latestWitnessSet = wasm.TransactionWitnessSet.from_hex(data.witnessSet);
    console.debug(latestWitnessSet.to_json());
    if (latestWitnessSet.vkeys().len() < data.signers.length) {
      throw new Error("Only " + latestWitnessSet.vkeys().len() + "/" + data.signers.length + " signers done");
    }
    await this.checkTx(tx, latestWitnessSet);
    if (onlyEvaluateTx) {
      console.log("Cardano Signer: submitTx, evaluateTx pass and do not submit");
      return "";
    } else {
      let txHash = await this.wallet.submitTx(tx, latestWitnessSet);
      console.log("Cardano Signer: submitTx, txHash: %s", txHash);
      return txHash;
    }
  }

  async checkTx(tx, witnessSet) {
    let wasm = tool.getWasm();
    let transaction = wasm.Transaction.new(tx.body(), witnessSet, tx.auxiliary_data());
    let cost = await evaluateTx(transaction);
    if (cost !== undefined) {
      console.debug("evaluateTx cost: %s", JSON.stringify(cost));
    } else {
      console.error("evaluateTx failed: %s", transaction.to_json());
      throw new Error("evaluateTx failed");
    }
  }

  // GroupNFT@GroupNFTHolder
  
  /* update one of {
    newOracleWorker,
    newTreasuryCheckVH,
    newMintCheckVH,
    newStackCheckVH,

  } */
  async updateGroupNFT(update, signers) {
    console.debug("Cardano Signer: updateGroupNFT, update: %O, signers: %O", update, signers);
    let tx, ctx = await this._getWalletContext();
    if (update.newOracleWorker) {
      tx = await this.sdk.setOracleWorker(update.newOracleWorker, signers, ctx.feeUtxos, ctx.collateralUtxos, ctx.selfAddress);
    } else if (update.newTreasuryCheckVH) {
      tx = await this.sdk.setTreasuryCheckVH(update.newTreasuryCheckVH, signers, ctx.feeUtxos, ctx.collateralUtxos, ctx.selfAddress);
    } else if (update.newMintCheckVH) {
      tx = await this.sdk.setMintCheckVH(update.newMintCheckVH, signers, ctx.feeUtxos, ctx.collateralUtxos, ctx.selfAddress);
    } else if (update.newStackCheckVH) {
      tx = await this.sdk.setStakeCheckVH(update.newStackCheckVH, signers, ctx.feeUtxos, ctx.collateralUtxos, ctx.selfAddress);
    } else {
      throw new Error("Invalid input parameters");
    }
    let result = await this._sign("updateGroupNFT", update, signers, tx);
    return result;
  }

  async upgradeGroupNFT() {
    throw new Error("Not support yet");
  }

  // AdminNFT@AdminNFTHolder

  async updateAdminNFT(newSigners, threshold, signers) {
    console.debug("Cardano Signer: updateAdminNFT, newSigners: %s, threshold: %s, signers: %O", newSigners, threshold, signers);
    let ctx = await this._getWalletContext();
    let tx = await this.sdk.setAdmin(newSigners, threshold, signers, ctx.feeUtxos, ctx.collateralUtxos, ctx.selfAddress);
    let result = await this._sign("setAdmin", {newSigners, threshold}, signers, tx);
    return result;
  }

  async upgradeAdminNFT() {
    throw new Error("Not support yet");
  }

  // CheckToken/TreasuryCheck@TreasuryCheck

  async mintTreasuryCheckToken(amount, signers) {
    console.debug("Cardano Signer: mintTreasuryCheckToken, amount: %s, signers: %O", signers);
    let ctx = await this._getWalletContext();
    let tx = await this.sdk.mintTreasuryCheckToken(amount, signers, ctx.feeUtxos, ctx.collateralUtxos, ctx.selfAddress);
    let result = await this._sign("mintTreasuryCheckToken", {amount}, signers, tx);
    return result;
  }

  async burnTreasuryCheckToken() {
    throw new Error("Not support yet");
  }

  async migrateTreasuryCheckToken() {
    throw new Error("Not support yet");
  }

  // CheckToken/MintCheck@MintCheck

  async mintMintCheckToken(amount, signers) {
    console.debug("Cardano Signer: mintMintCheckToken, amount: %s, signers: %O", signers);
    let ctx = await this._getWalletContext();
    let tx = await this.sdk.mintMintCheckToken(amount, signers, ctx.feeUtxos, ctx.collateralUtxos, ctx.selfAddress);
    let result = await this._sign("mintMintCheckToken", {amount}, signers, tx);
    return result;
  }

  async burnMintCheckToken() {
    throw new Error("Not support yet");
  }

  async migrateMintCheckToken() {
    throw new Error("Not support yet");
  }

  // UTXO@StakeCheck

  async registerStake() {
    throw new Error("Not neccessary");
  }

  async deregisterStake(signers) {
    console.debug("Cardano Signer: deregisterStake, signers: %O", signers);
    let ctx = await this._getWalletContext();
    let tx = await this.sdk.deregister(signers, ctx.feeUtxos, ctx.collateralUtxos, ctx.selfAddress);
    let result = await this._sign("deregisterStake", {}, signers, tx);
    return result;
  }

  async delegateStake(pool, signers) {
    console.debug("Cardano Signer: delegateStake, pool: %s, signers: %O", pool, signers);
    let ctx = await this._getWalletContext();
    let tx = await this.sdk.delegate(pool, signers, ctx.feeUtxos, ctx.collateralUtxos, ctx.selfAddress);
    let result = await this._sign("delegateStake", {pool}, signers, tx);
    return result;
  }

  async withdrawalStake(amount, receiptor, signers) {
    console.debug("Cardano Signer: withdrawalStake, amount: %s, receiptor: %s, signers: %O", amount, receiptor, signers);
    let ctx = await this._getWalletContext();
    let tx = await this.sdk.claim(amount, receiptor, signers, ctx.feeUtxos, ctx.collateralUtxos, ctx.selfAddress);
    let result = await this._sign("withdrawalStake", {amount, receiptor}, signers, tx);
    return result;
  }

  async _getWalletContext() {
    let feeUtxos = await this._getFeeUtxos();
    feeUtxos = feeUtxos.map(v => this._convertUtxo(v));
    let collateralUtxos = await this._getCollateralUtxos();
    collateralUtxos = collateralUtxos.map(v => this._convertUtxo(v));
    let addresses = await this.wallet.getAccounts();
    return {feeUtxos, collateralUtxos, selfAddress: addresses[0]};
  }

  async _getFeeUtxos(amount = 2000000) {
    let utxos = await this.wallet.getUtxos();
    let feeUtxos = [], totalAmount = new BigNumber(0);
    for (let utxo of utxos) {
      let multiasset = utxo.output().amount().multiasset();
      if (!(multiasset && multiasset.keys().len())) {
        feeUtxos.push(utxo);
        totalAmount = totalAmount.plus(utxo.output().amount().coin().to_str());
        if (totalAmount.gte(amount)) {
          feeUtxos.forEach((v, i) => console.debug("_getFeeUtxos %d: %O", i, v.to_json()));
          return feeUtxos;
        }
      }
    }
    throw new Error("No available utxos for tx fee");
  }

  async _getCollateralUtxos() {
    let utxos = await this.wallet.getCollateral();
    if (utxos.length === 0) {
      throw new Error("No collateral");
    }
    utxos.forEach((v, i) => console.debug("_getCollateralUtxos %d: %O", i, v.to_json()));
    return utxos;
  }

  _convertUtxo(utxo) {
    return {
      txHash: utxo.input().transaction_id().to_hex(),
      index: utxo.input().index(),
      value: {
        coins: utxo.output().amount().coin().to_str(),
        assets: {}
      },
      address: utxo.output().address().to_bech32(),
      datum: undefined,
      datumHash: undefined,
      script: undefined
    }
  }

  async _sign(fn, paras, signers, tx, latestWitnessSet = null) {
    let selfAddres = await this.wallet.getAccounts();
    if (!signers.includes(selfAddres[0])) {
      throw new Error("Not designated signer");
    }
    if (!latestWitnessSet) { // only debug for new tx
      console.debug("Cardano Signer: _sign tx: %O", tx.to_json());
    }
    let witnessSet = latestWitnessSet || tx.witness_set();
    let signed = await this.wallet.signTx(tx);
    console.debug("Cardano Signer: _sign new witnessSet: %O", signed.to_json());
    // check duplicate
    let vkeys = witnessSet.vkeys();
    if (vkeys) {
      let newVkeyWitness = signed.vkeys().get(0);
      let newVkeyWitnessJs = newVkeyWitness.to_js_value();
      for (let i = 0; i < vkeys.len(); i++) {
        let existVkeyWitness = vkeys.get(i);
        let existVkeyWitnessJs = existVkeyWitness.to_js_value();
        if (existVkeyWitnessJs.vkey === newVkeyWitnessJs.vkey) {
          if (existVkeyWitnessJs.signature === newVkeyWitnessJs.signature) {
            throw new Error("Already signed");
          } else {
            throw new Error("Signature mismatch");
          }
        }
      }
      vkeys.add(newVkeyWitness);
    } else { // first signature
      vkeys = signed.vkeys();
    }
    witnessSet.set_vkeys(vkeys);
    let output = {
      function: fn,
      paras,
      signers,
      tx: tx.to_hex(),
      witnessSet: witnessSet.to_hex()
    };
    let result = JSON.stringify(output);
    console.debug("Cardano Signer: _sign latest witnessSet: %O", witnessSet.to_json());
    console.debug(result);
    return result;
  }
}

module.exports = Signer;