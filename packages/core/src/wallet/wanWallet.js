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
      window.web3.eth.signTx(txData, (err, signedTx) => {
        if (err) {
          reject(err);
        } else {
          console.log("wanWallet signedTx: %O", signedTx);
          window.web3.eth.sendRawTransaction(signedTx, (err, txHash) => {
            if (err) {
              reject(err);
            } else {
              console.log("wanWallet sendRawTransaction txHash: %O", txHash);
              resolve(txHash);
            }
          })
        }
      });
    })
  }
}

module.exports = WanWallet;