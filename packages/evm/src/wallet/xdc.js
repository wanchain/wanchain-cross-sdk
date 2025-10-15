const Web3 = require("web3");
const Tools = require("../tool");

class XDCWallet {
  constructor(provider, type = "XDCWallet") {
    this.name = "xdc";
    this.web3 = new Web3(provider);
    this.type = type; // the type is not mandatory, many web3-compatible wallets are slightly different, can be handled differently according to the type
  }

  async getWallet() {
    let web3Provider;
    if (window.xdc) {
      web3Provider = window.xdc;
      try {
        const status = await window.xdc.enable();
        Tools.checkEnable(status);
      } catch (error) {
        throw new Error(error); 
      }
    } else {
      window.open('https://chrome.google.com/webstore/detail/xdcpay/bocpokimicclpaiekenaeelehdjllofo');
      throw new Error('please install xdc pay');
    }
    let web3 = new Web3(web3Provider);
    this.web3 = web3;
  }

  async getChainId() {
    return this.web3.eth.getChainId();
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
        console.debug("xdcWallet sendTransaction error: %O", err);
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
    let result = await window.xdc.on(...arg);
    return result;
  }
  
  async off(...arg) {
    const result = await window.xdc.off(...arg);
    return result;
  }
}

module.exports = XDCWallet;