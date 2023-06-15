const ContractSdk = require("cardano-contract-sdk");
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

  async _getFeeUtxos(amount) {
  }
}

module.exports = Signer;