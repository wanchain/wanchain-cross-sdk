import Web3 from "web3";
class WalletConnect {
  constructor(provider, type = "MetaMask") {
    this.name = "walletconnect";
    this.web3 = new Web3();
    this.ethProvider = provider;
    this.type = type; // the type is not mandatory, many web3-compatible wallets are slightly different, can be handled differently according to the type
  }
  async getChainId() {
    return this.web3.eth.getChainId();
  }
  async getWallet(chainlist) {
    let rpcMap = {};
    Array.from(chainlist).forEach((v) => {
      rpcMap[Number(v[1].chainId)] = Array.isArray(v[1].rpcUrls)
        ? v[1].rpcUrls[0]
        : v[1].rpcUrls;
    });
    const option = {
      projectId: '20759d10d280845d112536497b73c294',
      // projectId: 'c1878849d707424196092ec9439f82f4', // pensonal walletconnect account
      chains: [1],
      showQrModal: true,
      optionalChains: Array.from(chainlist).map((v) => Number(v[1].chainId)),
      // optionalChains: [1, 10, 56, 11155111],
      rpcMap: rpcMap,
      metadata: {
        name: 'WanBridge',
        description: 'WalletConnect',
        url: 'https://bridge.wanchain.org', // origin must match your domain & subdomain
        icons: ['https://www.wanscan.org/img/chain/Wanchain.png']
      }
    };
    const provider = await this.ethProvider.init(option);
    await provider.enable();
    let web3 = new Web3(provider);
    web3.eth.extend({
      methods: [
        {
          name: "chainId",
          call: "eth_chainId",
          outputFormatter: web3.utils.hexToNumber
        }
      ]
    });
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
    console.log('accounts', accounts);
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
export default WalletConnect;
