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
    let collateralUtxos = await this._getCollateralUtxos();
    let feeUtxos = await this._getFeeUtxos();
    let selfAddres = await this.wallet.getAccounts();
    let tx;
    if (update.newOracleWorker) {
      console.debug("updateGroupNFT get %d feeUtxos", feeUtxos.length);
      feeUtxos = feeUtxos.map(v => this._convertUtxo(v));
      console.debug("updateGroupNFT get %d collateralUtxos", collateralUtxos.length);
      collateralUtxos = collateralUtxos.map(v => this._convertUtxo(v));
      feeUtxos.forEach((v, i) => console.debug("feeUtxos %d: %O", i, v));
      collateralUtxos.forEach((v, i) => console.debug("collateralUtxos %d: %O", i, v));
      tx = await this.sdk.setOracleWorker(update.newOracleWorker, signers, feeUtxos, collateralUtxos, selfAddres[0]);
    }
    let witnessSet = await this.wallet.signTx(tx);
    let output = {
      function: "updateGroupNFT",
      input: tx.to_json(),
      witnessSet: witnessSet.to_json()
    };
    return JSON.stringify(output);
  }

  async upgradeGroupNFT() {
    
  }

  // AdminNFT@AdminNFTHolder

  async updateAdminNFT() {

  }

  async upgradeAdminNFT() {
    
  }

  // CheckToken/TreasuryCheck@TreasuryCheck

  async mintTreasuryCheckToken() {

  }

  async burnTreasuryCheckToken() {
    
  }

  async migrateTreasuryCheckToken() {
    
  }

  // CheckToken/MintCheck@MintCheck

  async mintMintCheckToken() {

  }

  async burnMintCheckToken() {
    
  }

  async migrateMintCheckToken() {
    
  }

  // UTXO@StakeCheck

  async registerStake() {

  }

  async deregisterStake() {
    
  }

  async delegateStake() {
    
  }

  async withdrawalStake() {
    
  }

  async _getCollateralUtxos() {
    let utxos = await this.wallet.getCollateral();
    if (utxos.length === 0) {
      throw new Error("No collateral");
    }
    utxos.map(utxo => console.log(utxo.to_json()))
    return utxos;
  }

  async _getFeeUtxos(amount = 2000000) {
    let utxos = await this.wallet.getUtxos();
    let feeUtxos = [], totalAmount = new BigNumber(0);
    for (let utxo of utxos) {
      let multiasset = utxo.output().amount().multiasset();
      if (!(multiasset && multiasset.keys().len())) {
        totalAmount = totalAmount.plus(utxo.output().amount().coin().to_str());
        if (totalAmount.gte(amount)) {
          feeUtxos.push(utxo);
          return feeUtxos;
        }
      }
    }
    throw new Error("No available utxos for tx fee");
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
}

module.exports = Signer;