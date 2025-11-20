import PeraWallet from "./src/wallet/pera";
import tool$0 from "./src/tool.js";
const tool = { default: tool$0 }.default;
export const getChains = () => ["Solana"];
export const getSymbols = () => ["SOL"];
export { PeraWallet };
export { tool };
export default {
    getChains,
    getSymbols,
    PeraWallet,
    tool
};
