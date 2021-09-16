const Web3Wallet = require("./web3Wallet");

let runInBrowser = false;
let Polkadot = undefined;
if (typeof(window) !== "undefined") {
  Polkadot = require("./polkadot/polkadotJs");
  runInBrowser = true;
}

class Wallet {
  constructor(type, provider) {
    if (!provider) {
      throw "Invalid provider";
    }
    this.type = type;
    if (["MetaMask", "WanMask", "WalletConnect", "WanWallet"].includes(type)) {
      if (runInBrowser) { // only browser
        return new Web3Wallet(type, provider);
      }
    } else if (type === "TruffleHD") {
      if (!runInBrowser) { // only nodejs
        return new Web3Wallet(type, provider);
      }
    } else if (type === "OtherWeb3") {
      return new Web3Wallet(type, provider); // do not check, developer himself ensures correctness
    } else if (type === "polkadot{.js}") {
      if (runInBrowser) { // only browser
        return new Polkadot(type, provider);
      }
    }
    throw "Unsupported wallet type";
  }
}

module.exports = Wallet;