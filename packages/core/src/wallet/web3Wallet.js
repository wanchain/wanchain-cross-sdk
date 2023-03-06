const Web3 = require("web3");

class Web3Wallet {
  constructor(provider, type = "MetaMask") {
    this.name = "Web3";
    this.web3 = new Web3(provider);
    this.type = type; // the type is not mandatory, many web3-compatible wallets are slightly different, can be handled differently according to the type
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
        console.error("web3Wallet sendTransaction error: %O", err);
        reject(err);
      })
    });
  }
}

module.exports = Web3Wallet;