import SuiWallet from "./src/wallet/suiWallet.js";
import tool$0 from "./src/tool.js";
const tool = tool$0.default;
export const getChains = () => ["Sui"];
export const getSymbols = () => ["SUI"];
export { SuiWallet };
export { tool };
export default {
    getChains,
    getSymbols,
    SuiWallet,
    tool
};
