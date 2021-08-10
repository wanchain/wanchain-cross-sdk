const { ApiPromise, WsProvider } = require('@polkadot/api');
const { web3Accounts, web3Enable, web3FromAddress } = require('@polkadot/extension-dapp');
const { buildUserlockMemo } = require("./memoProtocol");

class Polkadot {
  // mainnet: "wss://nodes.wandevs.org/polkadot"
  // testnet: "wss://nodes-testnet.wandevs.org/polkadot"
  constructor(type, provider) {
    this.type = type;
    if (typeof provider === "string") {
      provider = new WsProvider(provider);
    }
    this.api = new ApiPromise({provider});
  }

  async getApi() {
    return this.api.isReady;
  }

  async getChainId() {
    return 0;
  }

  async getAccounts() {
    try {
      const allInjected = await web3Enable('wanBridge');
      if (allInjected.length) {
        let accounts = await web3Accounts();
        return accounts.map(a => a.address);
      } else {
        console.error("polkadot{.js} no installed");
        return [];
      }
    } catch (err) {
      console.log("DOT getAccounts error:", err);
      return [];
    }
  }  

  async sendTransaction(txs, sender) {
    await this.getApi();
    const fromInjector = await web3FromAddress(sender);
    const blockInfo = await this.api.rpc.chain.getBlock();
    const blockNumber = blockInfo.block.header.number;
    const blockHash = await this.api.rpc.chain.getBlockHash(blockNumber.unwrap());
    let options = {};
    options.signer = fromInjector.signer;
    options.blockHash = blockHash.toHex();
    options.era = 64;
    const txHash = await this.api.tx.utility.batchAll(txs).signAndSend(sender, options);
    return txHash.toHex();
  }

  async buildUserLockMemo(tokenPairID, toPeerChainAccount, fee) {
    return buildUserlockMemo(tokenPairID, toPeerChainAccount, fee);
  }
}

module.exports = Polkadot;