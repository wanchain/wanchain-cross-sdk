const Web3Compatible = require("./web3Compatible");
const Polkadot = require("./polkadot/polkadotJs");

class Wallet {
  constructor(type, provider) {
    if (!this._checkType(type)) {
      throw "Unsupported wallet type";
    }
    if (!provider) {
      throw "Invalid provider";
    }
    this.type = type;
    if (["MetaMask", "WanMask"].includes(type)) {
      return new Web3Compatible(type, provider);
    } else if (type == "polkadot{.js}") {
      return new Polkadot(type, provider);
    }
  }

  _checkType(type) { // case sensitive
    let supports = ["MetaMask", "WanMask", "polkadot{.js}"];
    return supports.includes(type);
  }
}

module.exports = Wallet;