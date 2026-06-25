class OneAm {
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
      let errMsg = err.message;
      if (errMsg.indexOf("Wallet is syncing") >= 0) {
        throw new Error(errMsg);
      } else {
        console.error("%s not installed or not enabled: %O", this.name, err);
        throw new Error("Not installed or not enabled");
      }
    }
  }

  async getBalance(addr, tokenId) {
    tokenId = this.mappingTokenId(tokenId);
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

  async getBalances(addr, tokenIds) {
    let accounts = await this.getAccounts();
    if (addr === accounts[0]) {
      let assets = {};
      tokenIds.forEach(v => {
        assets[this.mappingTokenId(v)] = "0";
      })
      let wallet = await this.connect();
      let balance = await wallet.getUnshieldedBalances();
      for (let id of Object.keys(balance)) {
        if (assets[id] !== undefined) {
          assets[id] = balance[id].toString();
        }
      }
      return tokenIds.map(v => assets[this.mappingTokenId(v)]);
    } else {
      console.error("%s is not current address", addr);
      throw new Error("Not current address");
    }
  }

  // customized function

  mappingTokenId(tokenId) {
    if ((!tokenId) || (tokenId === "0000000000000000000000000000000000000000")) {
      tokenId = "0000000000000000000000000000000000000000000000000000000000000000";
    }
    return tokenId;
  }

  async connect() { // wrap wallet
    let wallet = await window.midnight["1am"].connect(this.network);
    return wallet;
  }
}

export default OneAm;
