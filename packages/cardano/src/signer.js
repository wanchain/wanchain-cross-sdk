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

  async signTx(wallet, txHex) {

  }

  async sendTx(wallet, txHex) {

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
    let result = await this._sign("updateGroupNFT", tx);
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

  async mintTreasuryCheckToken(amount) {
    console.debug("Cardano Signer: mintTreasuryCheckToken, amount: %s, signers: %O", signers);
    let feeUtxos = await this._getFeeUtxos();
    feeUtxos = feeUtxos.map(v => this._convertUtxo(v));
    let collateralUtxos = await this._getCollateralUtxos();
    collateralUtxos = collateralUtxos.map(v => this._convertUtxo(v));
    let selfAddres = await this.wallet.getAccounts();
    let tx = await this.sdk.mintTreasuryCheckToken(amount, signers, feeUtxos, collateralUtxos, selfAddres[0]);
    let result = await this._sign("mintTreasuryCheckToken", tx);
    return result;
  }

  async burnTreasuryCheckToken() {
    throw new Error("Not support yet");
  }

  async migrateTreasuryCheckToken() {
    throw new Error("Not support yet");
  }

  // CheckToken/MintCheck@MintCheck

  async mintMintCheckToken() {
    console.debug("Cardano Signer: mintMintCheckToken, amount: %s, signers: %O", signers);
    let feeUtxos = await this._getFeeUtxos();
    feeUtxos = feeUtxos.map(v => this._convertUtxo(v));
    let collateralUtxos = await this._getCollateralUtxos();
    collateralUtxos = collateralUtxos.map(v => this._convertUtxo(v));
    let selfAddres = await this.wallet.getAccounts();
    let tx = await this.sdk.mintMintCheckToken(amount, signers, feeUtxos, collateralUtxos, selfAddres[0]);
    let result = await this._sign("mintMintCheckToken", tx);
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
    let result = await this._sign("deregisterStake", tx);
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
    let result = await this._sign("delegateStake", tx);
    return result;
  }

  async withdrawalStake(amount, receiptor) {
    console.debug("Cardano Signer: withdrawalStake, amount: %s, receiptor: %s, signers: %O", amount, receiptor, signers);
    let feeUtxos = await this._getFeeUtxos();
    feeUtxos = feeUtxos.map(v => this._convertUtxo(v));
    let collateralUtxos = await this._getCollateralUtxos();
    collateralUtxos = collateralUtxos.map(v => this._convertUtxo(v));
    let selfAddres = await this.wallet.getAccounts();
    let tx = await this.sdk.claim(amount, receiptor, signers, feeUtxos, collateralUtxos, selfAddres[0]);
    let result = await this._sign("withdrawalStake", tx);
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

  async _sign(fn, tx) {
    let witnessSet = await this.wallet.signTx(tx);
    let output = {
      function: fn,
      input: tx.to_json(),
      witnessSet: witnessSet.to_json()
    };
    let result = JSON.stringify(output);
    console.debug(result);
    return result;
  }
}

module.exports = Signer;