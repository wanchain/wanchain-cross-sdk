const { ContractSdk } = require("cardano-contract-sdk/sdk.js");
const BigNumber = require("bignumber.js");
const tool = require("./tool");

class Signer {
  constructor(network, wallet) {
    this.network = network; // "testnet" or "mainnet"
    this.sdk = new ContractSdk(network === "mainnet");
    this.wallet = wallet;
  }

  async init(host, port) {
    await this.sdk.init(host, port);
  }

  // TX Signatures

  async signTx(hexData, wallet) {
    let data = JSON.parse(hexData);
    console.log("signTx data: %O", data);
    let wasm = tool.getWasm();
    let tx = wasm.Transaction.from_hex(data.tx);
    let latestWitnessSet = wasm.TransactionWitnessSet.from_hex(data.witnessSet);
    console.debug("signTx, tx: %s, latestWitnessSet: %s", tx.to_json(), latestWitnessSet.to_json());
    let result = await this._sign(data.function, data.paras, tx, latestWitnessSet);
    return result;
  }

  async sendTx(hexData, wallet) {

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
    let feeUtxos = await this._getFeeUtxos();
    feeUtxos = feeUtxos.map(v => this._convertUtxo(v));
    let collateralUtxos = await this._getCollateralUtxos();
    collateralUtxos = collateralUtxos.map(v => this._convertUtxo(v));
    let selfAddres = await this.wallet.getAccounts();
    let tx;
    if (update.newOracleWorker) {
      tx = await this.sdk.setOracleWorker(update.newOracleWorker, signers, feeUtxos, collateralUtxos, selfAddres[0]);
    } else if (update.newTreasuryCheckVH) {
      tx = await this.sdk.setTreasuryCheckVH(update.newTreasuryCheckVH, signers, feeUtxos, collateralUtxos, selfAddres[0]);
    } else if (update.newMintCheckVH) {
      tx = await this.sdk.setMintCheckVH(update.newMintCheckVH, signers, feeUtxos, collateralUtxos, selfAddres[0]);
    } else if (update.newStackCheckVH) {
      tx = await this.sdk.setStakeCheckVH(update.newStackCheckVH, signers, feeUtxos, collateralUtxos, selfAddres[0]);
    } else {
      throw new Error("Invalid input parameters");
    }
    let result = await this._sign("updateGroupNFT", {update, signers}, tx);
    return result;
  }

  async upgradeGroupNFT() {
    throw new Error("Not support yet");
  }

  // AdminNFT@AdminNFTHolder

  async updateAdminNFT() {
    throw new Error("Not support yet");
  }

  async upgradeAdminNFT() {
    throw new Error("Not support yet");
  }

  // CheckToken/TreasuryCheck@TreasuryCheck

  async mintTreasuryCheckToken(amount, signers) {
    console.debug("Cardano Signer: mintTreasuryCheckToken, amount: %s, signers: %O", signers);
    let feeUtxos = await this._getFeeUtxos();
    feeUtxos = feeUtxos.map(v => this._convertUtxo(v));
    let collateralUtxos = await this._getCollateralUtxos();
    collateralUtxos = collateralUtxos.map(v => this._convertUtxo(v));
    let selfAddres = await this.wallet.getAccounts();
    let tx = await this.sdk.mintTreasuryCheckToken(amount, signers, feeUtxos, collateralUtxos, selfAddres[0]);
    let result = await this._sign("mintTreasuryCheckToken", {amount, signers}, tx);
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
    let feeUtxos = await this._getFeeUtxos();
    feeUtxos = feeUtxos.map(v => this._convertUtxo(v));
    let collateralUtxos = await this._getCollateralUtxos();
    collateralUtxos = collateralUtxos.map(v => this._convertUtxo(v));
    let selfAddres = await this.wallet.getAccounts();
    let tx = await this.sdk.mintMintCheckToken(amount, signers, feeUtxos, collateralUtxos, selfAddres[0]);
    let result = await this._sign("mintMintCheckToken", {amount, signers}, tx);
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
    let feeUtxos = await this._getFeeUtxos();
    feeUtxos = feeUtxos.map(v => this._convertUtxo(v));
    let collateralUtxos = await this._getCollateralUtxos();
    collateralUtxos = collateralUtxos.map(v => this._convertUtxo(v));
    let selfAddres = await this.wallet.getAccounts();
    let tx = await this.sdk.deregister(signers, feeUtxos, collateralUtxos, selfAddres[0]);
    let result = await this._sign("deregisterStake", {signers}, tx);
    return result;
  }

  async delegateStake(pool, signers) {
    console.debug("Cardano Signer: delegateStake, pool: %s, signers: %O", pool, signers);
    let feeUtxos = await this._getFeeUtxos();
    feeUtxos = feeUtxos.map(v => this._convertUtxo(v));
    let collateralUtxos = await this._getCollateralUtxos();
    collateralUtxos = collateralUtxos.map(v => this._convertUtxo(v));
    let selfAddres = await this.wallet.getAccounts();
    let tx = await this.sdk.delegate(pool, signers, feeUtxos, collateralUtxos, selfAddres[0]);
    let result = await this._sign("delegateStake", {pool, signers}, tx);
    return result;
  }

  async withdrawalStake(amount, receiptor, signers) {
    console.debug("Cardano Signer: withdrawalStake, amount: %s, receiptor: %s, signers: %O", amount, receiptor, signers);
    let feeUtxos = await this._getFeeUtxos();
    feeUtxos = feeUtxos.map(v => this._convertUtxo(v));
    let collateralUtxos = await this._getCollateralUtxos();
    collateralUtxos = collateralUtxos.map(v => this._convertUtxo(v));
    let selfAddres = await this.wallet.getAccounts();
    let tx = await this.sdk.claim(amount, receiptor, signers, feeUtxos, collateralUtxos, selfAddres[0]);
    let result = await this._sign("withdrawalStake", {amount, receiptor, signers}, tx);
    return result;
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

  async _sign(fn, paras, tx, latestWitnessSet = null) {
    let witnessSet = latestWitnessSet || tx.witness_set();
    let vkeys = witnessSet.vkeys();
    let signed = await this.wallet.signTx(tx);
    let newVkeyWitness = signed.vkeys().get(0);
    // check duplicate
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
    witnessSet.set_vkeys(vkeys);
    let output = {
      function: fn,
      paras,
      tx: tx.to_hex(),
      witnessSet: witnessSet.to_hex()
    };
    let result = JSON.stringify(output);
    console.debug(witnessSet.to_json());
    console.debug(result);
    return result;
  }
}

module.exports = Signer;