const wasm = require("./src/wasm");
const NamiWallet = require("./src/wallet/nami");
const YoroiWallet = require("./src/wallet/yoroi");
const EternlWallet = require("./src/wallet/eternl");
const GeroWallet = require("./src/wallet/gero");
const Cip30Wallet = require("./src/wallet/cip30");
const tool = require("./src/tool");
const CoinSelection = require("./src/coinSelection");

async function init() {
  await wasm.init();
  let _wasm = wasm.getWasm();
  tool.setWasm(_wasm);
  CoinSelection.setWasm(_wasm);
}

module.exports = {
  getChains: () => ["Cardano"],
  getSymbols: () => ["ADA"],
  NamiWallet,
  YoroiWallet,
  EternlWallet,
  GeroWallet,
  Cip30Wallet,
  tool,
  init
};