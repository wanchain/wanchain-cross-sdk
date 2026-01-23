import Web3 from "web3";
import Tools from "../tool.js";

class OkxWallet {
  constructor(provider, type = "OkxWallet") {
    this.name = "okx";
    this.web3 = new Web3(provider);
    this.type = type; // the type is not mandatory, many web3-compatible wallets are slightly different, can be handled differently according to the type
  }

  async getWallet() {
    let web3Provider;
    if (window.okxwallet || window.okexchain) {
      web3Provider = window.okxwallet || window.okexchain;
      try {
        const status = await web3Provider.enable();
        Tools.checkEnable(status);
      } catch (error) {
        throw new Error(error);
      }
    } else {
      window.open('https://chromewebstore.google.com/detail/%E6%AC%A7%E6%98%93-web3-%E9%92%B1%E5%8C%85/mcohilncbfahbmgdjkbpemcciiolgcge');
      throw new Error('please install okx wallet');
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
          console.debug("okxWallet sendTransaction error: %O", err);
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
    let result = await window.okxwallet.on(...arg);
    return result;
  }

  async off(...arg) {
    const result = await window.okxwallet.off(...arg);
    return result;
  }
}

export default OkxWallet;
