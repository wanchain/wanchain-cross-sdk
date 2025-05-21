const Stargate = require("@cosmjs/stargate");
const ProtoSigning = require("@cosmjs/proto-signing");
const { MsgDepositForBurn } = require("../cctp/message");
const Long = require("long");

const DefaultChainInfo = {
  "theta-testnet-001": {
    rpc: "https://cosmos-testnet-rpc.itrocket.net",
    denom: "uatom"
  },
  "grand-1": {
    rpc: "https://noble-testnet-rpc.polkachu.com",
    denom: "uusdc"
  },
  "noble-1": {
    rpc: "https://noble-rpc.polkachu.com",
    denom: "uusdc"
  },
  "kava_2221-16000": {
    rpc: "https://rpc.testnet.kava.io",
    denom: "ukava"
  }
}

const MyRegistry = new ProtoSigning.Registry(Stargate.defaultRegistryTypes.concat([
  ["/circle.cctp.v1.MsgDepositForBurn", MsgDepositForBurn],
]));

class Keplr {
  constructor() {
    this.name = "Keplr";
    this.chainId = "";
    this.rpc = "";
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

  async getBalance(addr, denom) {
    let balance = "0";
    denom = denom || (DefaultChainInfo[this.chainId] && DefaultChainInfo[this.chainId].denom) || "uatom";
    let client = await this.getStargateClient();
    let balances = await client.getAllBalances(addr);
    console.log("Keplr getBalances: %O", balances);
    for (let b of balances) {
      if (b.denom === denom) {
        balance = b.amount;
        break;
      }
    }
    return balance;
  }

  // options = {memo, timeoutHeight, gasPrice}
  async sendTransaction(messages, options) {
    options = options || {};
    let memo = options.memo || "";
    let timeoutHeight = options.timeoutHeight || 0;
    let gasPrice = options.gasPrice;
    if (!gasPrice) {
      let chains = await this.wallet.getChainInfosWithoutEndpoints();
      let chainInfo = chains.find(v => v.chainId === this.chainId);
      let feeCurrency = chainInfo.feeCurrencies[0];
      gasPrice = feeCurrency.gasPriceStep.average + feeCurrency.coinMinimalDenom;
    }
    let key = await this.wallet.getKey(this.chainId);
    let client = await this.getStargateClient();
    // fee
    let gasUsed = await client.simulate(key.bech32Address, messages, memo);
    gasUsed = gasUsed * 1.5; // rectify by experience
    console.debug({gasUsed, gasPrice});
    let fee = (0, Stargate.calculateFee)(Math.round(gasUsed), gasPrice);
    // timeoutHeight
    let maxHeight = new Long(0);
    if (timeoutHeight) {
      let height = await client.getHeight();
      maxHeight = new Long(height + timeoutHeight);
    }
    let txHash = await client.signAndBroadcastSync(key.bech32Address, messages, fee, memo, maxHeight);
    return txHash;
  }

  // customized function

  setChainId(chainId, rpc) {
    this.chainId = chainId;
    this.rpc = rpc || (DefaultChainInfo[chainId] && DefaultChainInfo[chainId].rpc);
    if (!this.rpc) {
      throw new Error("Not support this chain");
    }
    this.stargateClient = null;
  }

  async getStargateClient() {
    if (!this.stargateClient) {
      let offlineSigner = this.wallet.getOfflineSigner(this.chainId);
      let client = await Stargate.SigningStargateClient.connectWithSigner(this.rpc, offlineSigner, {registry: MyRegistry});
      this.stargateClient = client;
    }
    return this.stargateClient;
  }
}

module.exports = Keplr;