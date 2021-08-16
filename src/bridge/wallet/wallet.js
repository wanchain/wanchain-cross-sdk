const Web3Wallet = require("./web3Wallet");
const Polkadot = require("./polkadot/polkadotJs");

class Wallet {
  constructor(type, provider) {
    if (!provider) {
      throw "Invalid provider";
    }
    this.type = type;
    if (["MetaMask", "WanMask", "WalletConnect", "OtherWeb3"].includes(type)) {
      return new Web3Wallet(type, provider);
    } else if (type === "polkadot{.js}") {
      return new Polkadot(type, provider);
    } else {
      throw "Unsupported wallet type";
    }
  }
}

module.exports = Wallet;