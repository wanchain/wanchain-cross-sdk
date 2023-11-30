const Osmosis = require("osmojs");
const Amino = require("@cosmjs/amino");
const Stargate = require("@cosmjs/stargate");
const CosmMath = require("@cosmjs/math");
const Tx = require("cosmjs-types/cosmos/tx/v1beta1/tx.js");
const ProtoSigning = require("@cosmjs/proto-signing");

const DefaultRpc = {
  "theta-testnet-001": "https://rpc.sentry-01.theta-testnet.polypore.xyz"
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
    this.stargateClient = null;
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
    let client = await this.getStargateClient();
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
    let key = await this.wallet.getKey(this.chainId);
    let signed = await this.wallet.signDirect(this.chainId, key.bech32Address, signDoc);
    let txRaw = Tx.TxRaw.fromPartial({
      bodyBytes: signed.signed.bodyBytes,
      authInfoBytes: signed.signed.authInfoBytes,
      signatures: [Buffer.from(signed.signature.signature, "base64")],
    });
    let tx = Tx.TxRaw.encode(txRaw).finish();
    let txHash = await this.wallet.sendTx(this.chainId, tx, "sync");
    txHash = Buffer.from(txHash).toString("hex");
    return txHash;
  }

  // customized function
  async getStargateClient() {
    if (!this.stargateClient) {
      let client = await Stargate.StargateClient.connect(this.rpc);
      this.stargateClient = client;
    }
    return this.stargateClient;
  }

  async getSigningClient() {
    if (!this.signingClient) {
      let client = await Osmosis.getSigningCosmosClient({rpcEndpoint: this.rpc});
      this.signingClient = client;
    }
    return this.signingClient;
  }

  async getHeight() {
    let stargateClient = await this.getStargateClient();
    let height = await stargateClient.getHeight();
    return height;
  }

  async estimateFee(txs, memo) {
    let key = await this.wallet.getKey(this.chainId);
    let base64Pk = Amino.encodeSecp256k1Pubkey(key.pubKey);
    let stargateClient = await this.getStargateClient();
    let { sequence } = await stargateClient.getSequence(key.bech32Address);
    let signingClient = await this.getSigningClient();
    let anyMsgs = txs.map(tx => signingClient.registry.encodeAsAny(tx));
    let { gasInfo } = await stargateClient.forceGetQueryClient().tx.simulate(anyMsgs, memo, base64Pk, sequence);
    let gasUsed = CosmMath.Uint53.fromString(gasInfo.gasUsed.toString()).toNumber();
    let gasPrice = Stargate.GasPrice.fromString('0.025uatom');
    let fee = (0, Stargate.calculateFee)(Math.round(gasUsed * 1.35), gasPrice);
    return fee;
  }

  async makeSignDoc(txBody, fee) {
    let key = await this.wallet.getKey(this.chainId);
    let base64Pk = Amino.encodeSecp256k1Pubkey(key.pubKey);
    let stargateClient = await this.getStargateClient();
    let { accountNumber, sequence } = await stargateClient.getSequence(key.bech32Address);
    let signingClient = await this.getSigningClient();
    let txBodyBytes = signingClient.registry.encode(txBody);
    let gasLimit = CosmMath.Int53.fromString(fee.gas).toNumber();
    let authInfoBytes = ProtoSigning.makeAuthInfoBytes([{pubkey: ProtoSigning.encodePubkey(base64Pk), sequence }], fee.amount, gasLimit);
    let signDoc = ProtoSigning.makeSignDoc(txBodyBytes, authInfoBytes, this.chainId, accountNumber);
    return signDoc;
  }
}

module.exports = Keplr;