import Web3 from "web3";
class WanWallet {
  constructor(provider, type = "wanwallet") {
    this.name = "wanwallet";
    this.web3 = new Web3();
    this.provider = provider;
    this.type = type; // the type is not mandatory, many web3-compatible wallets are slightly different, can be handled differently according to the type
  }
  async getChainId() {
    const chainId = await this.eth.getChainId();
    return chainId;
  }
  async getWallet(network) {
    let web3 = null;
    if (typeof window.injectWeb3 !== 'undefined' || window.injectWeb3) {
      const wanwallet = new this.provider({
        chainId: network === 'testnet' ? 999 : 888,
        url: network === 'testnet'
          ? 'https://gwan-ssl.wandevs.org:46891'
          : 'https://gwan-ssl.wandevs.org:56891',
        pollingInterval: 15000,
        requestTimeoutMs: 300000
      });
      await wanwallet.activate();
      web3 = await wanwallet.getProvider();
      web3 = new Web3(web3);
    }
    else {
      window.open('https://www.wanchain.org/wanwallet');
      throw new Error("No Wan Wallet Provider found");
    }
    this.web3 = web3;
    return this.web3;
  }
  async getAccounts(network) {
    let accounts = [];
    try { // WalletConnect do not support requestAccounts
      accounts = await this.web3.eth.requestAccounts();
    }
    catch (err) {
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
    }
    catch (err) {
      console.error("%s wallet getTxInfo %s faild", this.name, txHash);
      return null;
    }
  }
  async on(...arg) {
    const result = await this.web3.currentProvider.on(...arg);
    console.log('wcconnect on', result, this.web3);
    return result;
  }
  async off(...arg) {
    const result = await this.web3.currentProvider.off(...arg);
    return result;
  }
}
export default WanWallet;
