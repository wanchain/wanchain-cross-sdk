const { ApiPromise, WsProvider } = require('@polkadot/api');
const { web3Accounts, web3Enable, web3FromAddress } = require('@polkadot/extension-dapp');
const { getPolkadotSS58Format } = require('../../../utils/tool.js');
const BigNumber = require('bignumber.js');

const DefaultProvider = {
  DOT: {
    mainnet: "wss://rpc.polkadot.io",
    testnet: "wss://westend-rpc.polkadot.io"
  },
  PHA: {
    testnet: "wss://rhala-api.phala.network/ws"
  }
}

class Polkadot {
  constructor(type, provider, chain) {
    this.type = type;
    this.chain = chain;
    if (typeof(provider) === "string") {
      if (["mainnet", "testnet"].includes(provider)) {
        provider = DefaultProvider[chain][provider];
      }
      console.log("new %s polkadot.js wallet, provider: %s", chain, provider);
      provider = new WsProvider(provider);
    }
    this.api = new ApiPromise({provider});
  }

  // standard function

  async getChainId() {
    return 0;
  }

  async getAccounts(network) {
    const allInjected = await web3Enable('WanBridge');
    if (allInjected.length) {
      let ss58Format = getPolkadotSS58Format(this.chain, network);
      let accounts = await web3Accounts({ss58Format});
      return accounts.map(a => a.address);
    } else {
      console.error("%s not installed or not allowed", this.type);
      throw new Error("Not installed or not allowed");
    }
  }

  async getBalance(addr) {
    await this.getApi();
    let { data: balance } = await this.api.query.system.account(addr);
    return balance.free;
  }

  async sendTransaction(txs, sender) {
    await this.getApi();
    let fromInjector = await web3FromAddress(sender);
    let blockInfo = await this.api.rpc.chain.getBlock();
    let blockNumber = blockInfo.block.header.number;
    let blockHash = await this.api.rpc.chain.getBlockHash(blockNumber.unwrap());
    let options = {};
    options.signer = fromInjector.signer;
    options.blockHash = blockHash.toHex();
    options.era = 64;
    let txHash = await this.api.tx.utility.batchAll(txs).signAndSend(sender, options);
    if (txHash.txHash) { // strangely, local dapp directly returns txHash, but vercel dapp returns a composite object
      txHash = txHash.txHash;
    }
    console.debug("polkadotJs sendTransaction txHash: %s, %O", typeof(txHash), txHash);
    return txHash.toHex();
  }

  // customized function

  async getApi() {
    return this.api.isReady;
  }

  async estimateFee(sender, txs) {
    await this.getApi();
    let fromInjector = await web3FromAddress(sender);
    let info = await this.api.tx.utility.batch(txs).paymentInfo(sender, {signer: fromInjector.signer});
    let fee = new BigNumber(info.partialFee.toHex());
    return fee;
  }
}

module.exports = Polkadot;