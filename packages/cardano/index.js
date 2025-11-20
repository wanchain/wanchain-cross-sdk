import wasm from "./src/wasm/index.js";
import LaceWallet from "./src/wallet/lace.js";
import YoroiWallet from "./src/wallet/yoroi.js";
import EternlWallet from "./src/wallet/eternl.js";
import GeroWallet from "./src/wallet/gero.js";
import Cip30Wallet from "./src/wallet/cip30.js";
import tool from "./src/tool.js";
import CoinSelection from "./src/coinSelection.js";
async function init() {
    await wasm.init();
    let _wasm = wasm.getWasm();
    tool.setWasm(_wasm);
    CoinSelection.setWasm(_wasm);
}
export const getChains = () => ["Cardano"];
export const getSymbols = () => ["ADA"];
export { LaceWallet };
export { YoroiWallet };
export { EternlWallet };
export { GeroWallet };
export { Cip30Wallet };
export { tool };
export { init };
export default {
    getChains,
    getSymbols,
    LaceWallet,
    YoroiWallet,
    EternlWallet,
    GeroWallet,
    Cip30Wallet,
    tool,
    init
};
