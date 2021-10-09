const { ApiPromise, WsProvider } = require('@polkadot/api');
const { web3Accounts, web3Enable, web3FromAddress } = require('@polkadot/extension-dapp');
const { buildUserlockMemo } = require("./memoProtocol");
const dotTxWrapper = require('@substrate/txwrapper');

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

  async getAccounts(network) {
    const allInjected = await web3Enable('WanBridge');
    if (allInjected.length) {
      let ss58Format = ("testnet" === network)? dotTxWrapper.WESTEND_SS58_FORMAT : dotTxWrapper.POLKADOT_SS58_FORMAT;
      let accounts = await web3Accounts({ss58Format});
      return accounts.map(a => a.address);
    } else {
      console.error("polkadot{.js} not installed");
      throw "Not installed";
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