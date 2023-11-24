const Stargate = require("@cosmjs/stargate");
const Txs = require("cosmjs-types/cosmos/tx/v1beta1/tx.js");

const DefaultRpc = {
  "theta-testnet-001": "rpc.sentry-01.theta-testnet.polypore.xyz:26657"
}

class Keplr {
  constructor(chainId, rpc) {
    this.name = "Keplr";
    this.chainId = chainId; // Polkadot, Phala
    this.rpc = rpc || DefaultRpc[chainId];
    if (!this.rpc) {
      throw new Error("Not support this chain");
    }
    this.wallet = window.keplr;
  }

  // standard function

  async getChainId() {
    return this.chainId;
  }

  async getAccounts() {
    try {
      let key = await this.wallet.getKey(this.chainId);
      return [key.bech32Address];
    } catch (err) {
      console.error("%s getAccounts error: %O", this.name, err);
      throw new Error("Not installed or not allowed");
    } 
  }

  async getBalance(addr) {
    let balance = "0";
    let client = await this.getClient();
    let balances = await client.getAllBalances(addr);
    console.log("Keplr getBalances: %O", balances);
    for (let b of balances) {
      if (b.denom === "uatom") {
        balance = b.amount;
        break;
      }
    }
    return balance;
  }

  async sendTransaction(signDoc) {
    let accounts = await getAccounts();
    let signed = await this.wallet.signDirect(this.chainId, accounts[0], signDoc);
    console.log("keplr %s sign %O: %O", accounts[0], signDoc, signed);
    let tx = Txs.TxRaw.fromPartial({
      bodyBytes: signed.signed.bodyBytes,
      authInfoBytes: signed.signed.authInfoBytes,
      signatures: [Buffer.from(signed.signature.signature, "base64")],
    });
    let txHash = await keplr.sendTx(this.chainId, tx, "sync");
    console.log("keplr sendTx %O", txHash);
    return txHash;
  }

  // customized function
  async getKey() {
    let key = await this.wallet.getKey(this.chainId);
    return key;
  }

  async getClient() {
    let client = await Stargate.StargateClient.connect(this.rpc);
    return client;
  }

  async estimateFee(sender, txs) {

  }
}

module.exports = Keplr;