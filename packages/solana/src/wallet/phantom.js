const Web3 = require('@solana/web3.js');

class Phantom {
  constructor(network) {
    this.name = "Phantom";
    this.network = (network === "mainnet")? "mainnet-beta" : "devnet";
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

  async getBalance(addr, tokenAccount = "") {
    let balance = "0";
    let provider = this.getProvider();
    let connection = new Web3.Connection(Web3.clusterApiUrl(this.network), 'confirmed');
    if (tokenAccount) {
      let data = await connection.getParsedTokenAccountsByOwner(provider.publicKey, {mint: new Web3.PublicKey(tokenAccount)});
      let tokenInfo = data && data.value && data.value[0];
      if (tokenInfo) {
        balance = tokenInfo.account.data.parsed.info.tokenAmount.amount;
      }
    } else {
      balance = await connection.getBalance(provider.publicKey);
    }
    return balance;
  }

  async sendTransaction(tx, otherSigner = null) {
    let provider = this.getProvider();
    let otherSig = tx.signatures[1];
    let signedTx = await provider.signTransaction(tx);
    if (otherSigner) {
      signedTx.addSignature(otherSigner, otherSig);
    }
    console.debug({tx3: JSON.parse(JSON.stringify(signedTx))});
    let connect = this.getConnection();
    let signature = await connect.sendRawTransaction(signedTx.serialize(),  { skipPreflight: true });
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
        return provider;
      }
    }
    throw new Error("Not installed or not allowed");
  }

  getConnection() {
    return new Web3.Connection(Web3.clusterApiUrl(this.network), 'confirmed');
  }
}

module.exports = Phantom;