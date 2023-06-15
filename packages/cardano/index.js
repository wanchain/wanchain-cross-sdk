const wasm = require("./src/wasm");
const NamiWallet = require("./src/wallet/nami");
const YoroiWallet = require("./src/wallet/yoroi");
const Signer = require("./src/signer");
const tool = require("./src/tool");
const CoinSelection = require("./src/coinSelection");
const sdkContractsMgr = require("cardano-contract-sdk/contracts-mgr.js");
const sdkContracts = require("cardano-contract-sdk/contracts.js");
const sdkOgmiosUtils = require("cardano-contract-sdk/ogmios-utils.js");
const sdkSdk = require("cardano-contract-sdk/sdk.js");
const sdkUtils = require("cardano-contract-sdk/utils.js");

async function init() {
  await wasm.init();
  let _wasm = wasm.getWasm();
  tool.setWasm(_wasm);
  CoinSelection.setWasm(_wasm);
  sdkContractsMgr.setWasm(_wasm);
  sdkContracts.setWasm(_wasm);
  sdkOgmiosUtils.setWasm(_wasm);
  sdkSdk.setWasm(_wasm);
  sdkUtils.setWasm(_wasm);
}

module.exports = {
  getChains: () => ["Cardano"],
  getSymbols: () => ["ADA"],
  NamiWallet,
  YoroiWallet,
  Signer,
  tool,
  init
};