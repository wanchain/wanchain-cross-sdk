import PolkadotJsWallet from "./src/wallet/polkadotJs.js";
import tool from "./src/tool.js";
export const getChains = () => ["Polkadot", "Phala"];
export const getSymbols = () => ["DOT", "PHA"];
export { PolkadotJsWallet };
export { tool };
export default {
    getChains,
    getSymbols,
    PolkadotJsWallet,
    tool
};
