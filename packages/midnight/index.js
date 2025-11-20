import MidnightLaceWallet from "./src/wallet/lace.js";
import tool from "./src/tool.js";
export const getChains = () => ["Midnight"];
export const getSymbols = () => ["DUST"];
export { MidnightLaceWallet };
export { tool };
export default {
    getChains,
    getSymbols,
    MidnightLaceWallet,
    tool
};
