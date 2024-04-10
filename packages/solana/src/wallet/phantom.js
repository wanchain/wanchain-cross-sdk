const anchor = require('@coral-xyz/anchor');
const Web3 = require('@solana/web3.js');
const cctpProxyIdl = require("../cctp/circle_cctp_proxy_contract.json");
const messageTransmitterIdl = require("../cctp/idl_message_transmitter.json");
const { PublicKey, TransactionMessage, VersionedTransaction } = require('@solana/web3.js');

class Phantom {
  constructor(network) {
    this.name = "Phantom";
    this.network = (network === "mainnet")? "mainnet-beta" : "devnet";
    this.connection = new Web3.Connection(Web3.clusterApiUrl(this.network), 'confirmed');
  }

  // standard function

  async getChainId() {
    return 0;
  }

  async getAccounts() {
    try {
      let provider = this.getProvider();
      let resp = await provider.connect();
      return [resp.publicKey.toString()];
    } catch (err) {
      console.error("%s getAccounts error: %O", this.name, err);
      throw new Error("Not installed or not allowed");
    }
  }

  async getBalance(address, tokenAccount = "") {
    let balance = "0";
    let publicKey = new PublicKey(address);
    if (tokenAccount) {
      let data = await this.connection.getParsedTokenAccountsByOwner(publicKey, {mint: new Web3.PublicKey(tokenAccount)});
      let tokenInfo = data && data.value && data.value[0];
      if (tokenInfo) {
        balance = tokenInfo.account.data.parsed.info.tokenAmount.amount;
      }
    } else {
      balance = await this.connection.getBalance(publicKey);
    }
    return balance;
  }

  async sendTransaction(tx, secondSigner = null) {
    let secondSig = null;
    if (secondSigner) {
      tx.sign([secondSigner]);
      secondSig = tx.signatures[1];
    }
    let provider = this.getProvider();
    let signedTx = await provider.signTransaction(tx);
    if (secondSig) {
      signedTx.addSignature(secondSigner.publicKey, secondSig);
    }
    let signature = await this.connection.sendRawTransaction(signedTx.serialize(),  { skipPreflight: true });
    return signature;
  }

  // customized function

  getPublicKey() {
    let provider = this.getProvider();
    return provider.publicKey; 
  }

  getProvider() {
    if (window.phantom) {
      let provider = window.phantom.solana;
      if (provider && provider.isPhantom) {
        provider.connection = this.connection;
        return provider;
      }
    }
    throw new Error("Not installed or not allowed");
  }

  getProgram(name, id) {
    let provider = this.getProvider();
    if (name === "cctpProxy") {
      return new anchor.Program(cctpProxyIdl, id, provider);
    } else if (name === "messageTransmitter") {
      return new anchor.Program(messageTransmitterIdl, id, provider);
    } else {
      return null;
    }
  }

  async buildTransaction(instructions) {
    let payerKey = this.getPublicKey();
    let recentBlockHash = await this.connection.getLatestBlockhash();
    let messageV0 = new TransactionMessage({payerKey, recentBlockhash: recentBlockHash.blockhash, instructions}).compileToV0Message();
    return new VersionedTransaction(messageV0);
  }
}

module.exports = Phantom;