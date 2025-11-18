const Web3 = require("web3");
const Tools = require("../tool");

class CtrlWallet {
  constructor(provider, type = "CtrlWallet") {
    this.name = "ctrl";
    this.web3 = new Web3(provider);
    this.type = type; // the type is not mandatory, many web3-compatible wallets are slightly different, can be handled differently according to the type
  }

  async getWallet() {
    let ctrlProvider;
    if (window.ctrlEthProviders) {
      try {
        ctrlProvider = window.ctrlEthProviders['Ctrl Wallet'].provider;
        const status = await ctrlProvider.enable();
        console.log('status', status);
        Tools.checkEnable(status);
      } catch (error) {
        throw new Error(error);
      }
    } else {
      window.open('https://ctrl.xyz');
      throw new Error('please install ctrl wallet');
    }
    let web3 = new Web3(ctrlProvider);
    this.web3 = web3;
  }

  async getNetworkId() {
    const networkId = await this.web3eth.net.getId();
    return networkId;
  }

  async getChainId() {
    const chainId = await this.web3.eth.getChainId();
    return chainId;
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
        console.debug("ctrlWallet sendTransaction error: %O", err);
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

  async on(name, ...arg) {
    let result = await window.ctrlEthProviders['Ctrl Wallet'].provider.on(...arg);
    return result;
  }
  
  async off(...arg) {
    const result = await window.ctrlEthProviders['Ctrl Wallet'].provider.off(...arg);
    return result;
  }
}

module.exports = CtrlWallet;