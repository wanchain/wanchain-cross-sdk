const { ApiPromise, WsProvider } = require('@polkadot/api');
const { web3Accounts, web3Enable, web3FromAddress } = require('@polkadot/extension-dapp');
const { getSS58Format } = require('../tool.js');
const BigNumber = require('bignumber.js');

const DefaultProvider = {
  Polkadot: {
    mainnet: "wss://rpc.polkadot.io",
    testnet: "wss://westend-rpc.polkadot.io"
  },
  Phala: {
    testnet: "wss://rhala-api.phala.network/ws"
  }
}

class PolkadotJs {
  constructor(provider, chain) { // Polkadot, Phala
    this.name = "polkadot{.js}";
    this.setChain(chain, provider);
  }

  // standard function

  async getChainId() {
    return 0;
  }

  async getAccounts(network) {
    const allInjected = await web3Enable('WanBridge');
    if (allInjected.length) {
      let ss58Format = getSS58Format(this.chain, network);
      let accounts = await web3Accounts({ss58Format});
      return accounts.map(a => a.address);
    } else {
      console.error("%s not installed or not allowed", this.name);
      throw new Error("Not installed or not allowed");
    }
  }

  async getBalance(addr) {
    let api = await this.getApi();
    let { data: balance } = await api.query.system.account(addr);
    return balance.free;
  }

  async sendTransaction(txs, sender) {
    return new Promise(async (resolve, reject) => {
      let api = await this.getApi();
      let injector = await web3FromAddress(sender);
      api.tx.utility.batchAll(txs).signAndSend(sender, {signer: injector.signer}, ({txHash, status}) => {
        txHash = txHash.toString();
        if (status.isBroadcast) {
          console.debug("%s sendTransaction tx %s status: %s", this.chain, txHash, status.type);
          return resolve(txHash);
        } else if (status.isInBlock || status.isFinalized) {
          let block = status.isInBlock? status.asInBlock : status.asFinalized;
          console.debug("%s block %s tx %s status: %s", this.chain, block.toString(), txHash, status.type);
          return resolve(txHash);
        }
      }).catch(err => {
        return reject(err);
      });
    })
  }

  // customized function
  setChain(chainName, provider) {
    this.chain = chainName;
    if (provider && typeof(provider) === "string") {
      if (["mainnet", "testnet"].includes(provider)) {
        provider = DefaultProvider[chainName][provider];
      }
      console.debug("set polkadot.js wallet chain %s provider: %s", chainName, provider);
      provider = new WsProvider(provider);
    }
    this.provider = provider;
    this.api = null;
  }

  async getApi() {
    if (!this.api) {
      this.api = new ApiPromise({provider: this.provider});
    }
    await this.api.isReady;
    return this.api;
  }

  async estimateFee(sender, txs) {
    let api = await this.getApi();
    let info = await api.tx.utility.batch(txs).paymentInfo(sender);
    let fee = new BigNumber(info.partialFee.toHex());
    return fee;
  }
}

module.exports = PolkadotJs;