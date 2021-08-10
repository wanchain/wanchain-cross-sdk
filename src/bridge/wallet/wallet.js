const Web3Compatible = require("./Web3Compatible");

class Wallet {
  constructor(type, wallet) {
    if (!this._checkType(type)) {
      throw "Unsupported wallet type";
    }
    if (!wallet) {
      throw "Invalid wallet";
    }
    this.type = type;
    if (["MetaMask", "WanMask"].includes(type)) {
      return new Web3Compatible(wallet);
    } else if (type == "polkadot{.js}") {

    }
  }

  _checkType(type) { // case sensitive
    let supports = ["MetaMask", "WanMask", "polkadot{.js}"];
    return supports.includes(type);
  }
}

module.exports = Wallet;