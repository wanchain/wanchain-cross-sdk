class WanWallet {
  constructor() {
    this.name = "Wan";
  }

  async getChainId() {
    return new Promise((resolve, reject) => {
      window.web3.eth.getChainId((err, data) => {
        if (err) {
          reject(err);
        } else {
          resolve(data);
        }
      });
    })
  }

  async getAccounts(network) {
    return new Promise((resolve, reject) => {
      window.web3.eth.getAccounts((err, data) => {
        if (err) {
          reject(err);
        } else {
          resolve(data);
        }
      });
    })
  }

  async sendTransaction(txData, sender) {
    return new Promise((resolve, reject) => {
      window.web3.eth.sendTransaction(txData, (err, data) => {
        if (err) {
          reject(err);
        } else {
          resolve(data);
        }
      });
    })
  }
}

module.exports = WanWallet;