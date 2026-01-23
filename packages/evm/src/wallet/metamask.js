import Web3 from "web3";
import Tools from "../tool.js";

class MetaMask {
  constructor(provider, type = "MetaMask") {
    this.name = "metamask";
    this.web3 = new Web3(provider);
    this.type = type; // the type is not mandatory, many web3-compatible wallets are slightly different, can be handled differently according to the type
  }

  async getWallet() {
    let web3Provider;
    if (window.ethereum) {
      web3Provider = window.ethereum;
      try {
        let accounts, status;
        if (window.ctrlEthProviders) {
          web3Provider = window.ctrlEthProviders.MetaMask.provider;
          accounts = await web3Provider.request({ method: 'eth_requestAccounts' });
          status = accounts;
        } else {
          accounts = await web3Provider.request({ method: 'eth_requestAccounts' });
          status = await web3Provider.enable();
        }
        Tools.checkEnable(status);
      } catch (error) {
        console.error(error);
        throw new Error('User denied account access');
      }
    } else if (window.web3) {
      web3Provider = window.web3.currentProvider;
      try {
        await web3Provider.enable();
      } catch (error) {
        console.error(error);
        throw new Error('User denied account access');
      }
    } else {
      window.open('https://metamask.io');
      throw new Error('please install metamask wallet');
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
          console.debug("web3Wallet sendTransaction error: %O", err);
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
    let result = await window.ethereum.on(...arg);
    return result;
  }

  async off(...arg) {
    const result = await window.ethereum.off(...arg);
    return result;
  }
}

export default MetaMask;
