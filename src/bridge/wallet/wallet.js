const Web3Wallet = require("./web3Wallet");

let runInBrowser = false;
let Polkadot = undefined;
let Nami = undefined;
let TronLink = undefined;
if (typeof(window) !== "undefined") {
  runInBrowser = true;
  Polkadot = require("./polkadot/polkadotJs");
  Nami = require("./cardano/nami");
  TronLink = require("./tron/TronLink");
}

class Wallet {
  constructor(type, provider, chain) {
    if (!provider) {
      throw new Error("Invalid provider");
    }
    console.debug("SDK: new Wallet type %s", type);
    if (["MetaMask", "WanMask", "WalletConnect", "WanWallet", "XDCPay", "OKXWallet", "CLVWallet"].includes(type)) {
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
        return new Polkadot(type, provider, chain);
      }
    } else if (type === "Nami") {
      if (runInBrowser) { // only browser
        return new Nami(type, provider);
      }
    } else if (type === "TronLink") {
      if (runInBrowser) { // only browser
        return new TronLink(type, provider);
      }
    }
    throw new Error("Unsupported wallet type");
  }
}

module.exports = Wallet;