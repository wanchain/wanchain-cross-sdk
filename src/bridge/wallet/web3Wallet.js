const Web3 = require("web3");

class Web3Wallet {
  constructor(type, provider) {
    this.type = type;
    this.web3 = new Web3(provider);
  }

  async getChainId() {
    return this.web3.eth.getChainId();
  }

  async getAccounts() {
    try { // WalletConnect do not support requestAccounts
      return this.web3.eth.requestAccounts();
    } catch(err) {
      return this.web3.eth.getAccounts();
    }
  }

  async sendTransaction(txData, sender) {
    try {
      let receipt = await this.web3.eth.sendTransaction(txData);
      let txhash = receipt.transactionHash;
      return {result: true, txhash, desc: "Succeeded"};
    } catch(err) {
      let desc = (err.code === 4001)? "Rejected" : "Failed"; // refused
      return {result: false, txhash: err.message, desc};
    }
  }
}

module.exports = Web3Wallet;