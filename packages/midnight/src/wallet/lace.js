class Lace {
  constructor(network) {
    this.name = "Lace Midnight";
    this.network = (network === "mainnet") ? "mainnet" : "preprod";
  }

  // standard function

  async getChainId() {
    return this.network;
  }

  async getAccounts() {
    try {
      let wallet = await this.connect();
      let addr = await wallet.getUnshieldedAddress();
      return [addr.unshieldedAddress];
    } catch (err) {
      console.error("%s not installed or not enabled: %O", this.name, err);
      throw new Error("Not installed or not enabled");
    }
  }

  async getBalance(addr, tokenId) {
    tokenId = tokenId || "0000000000000000000000000000000000000000000000000000000000000000";
    let accounts = await this.getAccounts();
    if (addr === accounts[0]) {
      let wallet = await this.connect();
      let balance = await wallet.getUnshieldedBalances();
      for (let id of Object.keys(balance)) {
        if (tokenId === id) {
          return balance[id].toString();
        }
      }
      return "0";
    } else {
      console.error("%s is not current address", addr);
      throw new Error("Not current address");
    }
  }

  // customized function

  async connect() { // wrap wallet
    let walletKey = Object.keys(window.midnight)[0];
    let wallet = await window.midnight[walletKey].connect(this.network);
    return wallet;
  }
}

export default Lace;
