const { PeraWalletConnect } = require("@perawallet/connect");

class Pera {
  constructor(network) {
    this.name = "Pera";
    if (!['mainnet', 'testnet'].includes(network)) {
      throw new Error("Invalid network, should be 'mainnet' or 'testnet'");
    }
    this.network = network;
    let chainId = (network === "mainnet")? 416001 : 416002;
    this.wallet = new PeraWalletConnect({chainId});
  }

  // standard function

  getChainId() {
    return this.wallet.chainId;
  }

  async getAccounts() {
    try {
      let accounts = await this.wallet.reconnectSession();
      if (accounts.length === 0) {
        await this.wallet.disconnect();
        accounts = await this.wallet.connect();
      }
      console.log("%s accounts: %O", this.name, accounts);
      return accounts;
    } catch (err) {
      console.error("%s connect error: %O", this.name, err);
      throw new Error("Not installed or not allowed");
    }
  }

  async signTransaction(txGroups) {
    let signedTxn = await this.wallet.signTransaction(txGroups);
    return signedTxn;
  }
}

module.exports = Pera;