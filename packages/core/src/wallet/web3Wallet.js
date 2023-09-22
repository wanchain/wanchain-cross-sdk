const Web3 = require("web3");

class Web3Wallet {
  constructor(provider, type = "MetaMask") {
    this.name = "Web3";
    this.provider = provider;
    this.web3 = new Web3(provider);
    this.type = type; // the type is not mandatory, many web3-compatible wallets are slightly different, can be handled differently according to the type
  }

  async getChainId() {
    if (window.injectWeb3) {
      // return new Promise((resolve, reject) => {
      //   console.log('wanwallet getChainId');
      //   window.web3.eth.getChainId((err, chainId) => {
      //     console.log('wanwallet getChainId: %O, %O', err, chainId);
      //     if (err) {
      //       reject(err);
      //     } else {
      //       resolve(chainId);
      //     }
      //   });
      // })
      console.log("provider: %O", this.provider.provider);
      console.log("provider getChainId: %O", await this.provider.getChainId());
      console.log("this.web3.eth.getChainId: %O", await this.web3.eth.getChainId());
      console.log("provider getAccount: %O", await this.provider.getAccount());
      console.log("this.web3.eth.getAccount: %O", await this.web3.eth.getAccount());
      return this.provider.getChainId();
    } else {
      return this.web3.eth.getChainId();
    }
  }

  async getAccounts(network) {
    let accounts = [];
    try { // WalletConnect do not support requestAccounts
      accounts = await this.web3.eth.requestAccounts();
    } catch(err) {
      accounts = await this.web3.eth.getAccounts();
    }
    return accounts;
  }

  async sendTransaction(txData, sender) {
    return new Promise((resolve, reject) => {
      this.web3.eth.sendTransaction(txData)
      .on("transactionHash", txHash => {
        resolve(txHash);
      }).on("error", err => {
        console.debug("web3Wallet sendTransaction error: %O", err);
        reject(err);
      })
    });
  }

  async getTxInfo(txHash) {
    try {
      let txInfo = await this.web3.eth.getTransaction(txHash);
      return txInfo;
    } catch (err) {
      console.error("%s wallet getTxInfo %s faild", this.name, txHash);
      return null;
    }
  }
}

module.exports = Web3Wallet;