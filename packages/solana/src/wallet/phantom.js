const anchor = require('@coral-xyz/anchor');
const Web3 = require('@solana/web3.js');
const cctpProxyIdl = require("../cctp/circle_cctp_proxy_contract.json");
const messageTransmitterIdl = require("../cctp/idl_message_transmitter.json");
const wanBridgeIdl = require("../wanbridge/cross_delegate.json");
const { PublicKey, TransactionMessage, VersionedTransaction } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } = require('@solana/spl-token');

class Phantom {
  constructor(network) {
    if (window.phantom) {
      this.name = "Phantom";
      this.network = (network === "mainnet") ? "mainnet-beta" : "devnet";
      const href = network === 'mainnet' ? 'https://solana-mainnet.g.alchemy.com/v2/C37RKXJKkDTkcBkt6Uc8FmCa_3AcNyFx' : Web3.clusterApiUrl(this.network);
      this.connection = new Web3.Connection(href, 'confirmed');
    } else {
      message.error('please install phantom wallet');
      window.open('https://phantom.app');
      throw new Error('please install phantom wallet');
    }
  }

  // standard function

  async getChainId() {
    return this.network;
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

  async getBalances(address, tokenAccounts) {
    let publicKey = new PublicKey(address);
    let [coin, splTokens, spl2022tokens] = await Promise.all([
      this.connection.getBalance(publicKey),
      this.connection.getParsedTokenAccountsByOwner(publicKey, {programId: TOKEN_PROGRAM_ID}),
      this.connection.getParsedTokenAccountsByOwner(publicKey, {programId: TOKEN_2022_PROGRAM_ID})
    ]);
    let assets = {"": coin};
    splTokens.value.forEach(v => {
      let ti = v.account.data.parsed.info;
      assets[ti.mint] = ti.tokenAmount.amount;
    });
    spl2022tokens.value.forEach(v => {
      let ti = v.account.data.parsed.info;
      assets[ti.mint] = ti.tokenAmount.amount;
    });
    return tokenAccounts.map(v => assets[v] || "0");
  }

  async sendTransaction(tx, otherSigner = null) {
    if (otherSigner) {
      tx.sign([otherSigner]);
    }
    let provider = this.getProvider();
    let { signature } = await provider.signAndSendTransaction(tx,  { skipPreflight: true });
    return signature;
  }

  // customized function

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
    } else if (name === "wanBridge") {
      return new anchor.Program(wanBridgeIdl, id, provider);
    } else {
      return null;
    }
  }

  async getRecentPrioritizationFees() {
    let recentFees = await this.connection.getRecentPrioritizationFees();
    return recentFees;
  }

  async buildTransaction(instructions) {
    let provider = this.getProvider();
    let latestBlockhash = await this.connection.getLatestBlockhash();
    console.debug("%s %s latestBlockhash: %O", this.name, this.network, latestBlockhash);
    let messageV0 = new TransactionMessage({payerKey: provider.publicKey, recentBlockhash: latestBlockhash.blockhash, instructions}).compileToV0Message();
    return new VersionedTransaction(messageV0);
  }
}

module.exports = Phantom;