const Web3Wallet = require("./web3Wallet");

let runInBrowser = false;
let Polkadot = undefined;
let Nami = undefined;
if (typeof(window) !== "undefined") {
  runInBrowser = true;
  Polkadot = require("./polkadot/polkadotJs");
  Nami = require("./cardano/nami");
}

class Wallet {
  constructor(type, provider) {
    if (!provider) {
      throw new Error("Invalid provider");
    }
    this.type = type;
    console.debug("SDK: new Wallet type %s", type);
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
    } else if (type === "Nami") {
      if (runInBrowser) { // only browser
        return new Nami(type, provider);
      }
    }
    throw new Error("Unsupported wallet type");
  }
}

module.exports = Wallet;