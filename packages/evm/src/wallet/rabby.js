import Web3 from "web3";
import Tools from "../tool.js";

class RabbyWallet {
  constructor(provider, type = "RabbyWallet") {
    this.name = "rabby";
    this.web3 = new Web3(provider);
    this.type = type; // the type is not mandatory, many web3-compatible wallets are slightly different, can be handled differently according to the type
  }

  async getWallet() {
    let web3Provider;
    if (window.rabby) {
      web3Provider = window.rabby;
      try {
        const status = await window.rabby.enable();
        Tools.checkEnable(status);
      } catch (error) {
        throw new Error('User denied account access');
      }
    } else {
      window.open('https://chromewebstore.google.com/detail/rabby-wallet/acmacodkjbdgmoleebolmdjonilkdbch');
      throw new Error('please install rabby wallet');
    }
    let web3 = new Web3(web3Provider);
    this.web3 = web3;
    return this.web3;
  }

  async getChainId() {
    return this.web3.eth.getChainId();
  }

  async getAccounts(network) {
    let accounts = [];
    try { // WalletConnect do not support requestAccounts
      accounts = await this.web3.eth.requestAccounts();
    } catch (err) {
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
          console.debug("rabbyWallet sendTransaction error: %O", err);
          reject(err);
        });
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
    let result = await window.rabby.on(...arg);
    return result;
  }

  async off(...arg) {
    const result = await window.rabby.off(...arg);
    return result;
  }
}

export default RabbyWallet;
