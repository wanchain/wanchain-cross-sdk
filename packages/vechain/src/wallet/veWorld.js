import { ABIContract, Address, Clause, VET, Units } from "@vechain/sdk-core";
import { DAppKit } from "@vechain/dapp-kit";
import wanBridgeAbi from "../abi/crossDelegate.json" with { type: "json" };
import erc20Abi from "../abi/erc20.json" with { type: "json" };
import BigNumber from "bignumber.js";
const DefaultProvider = {
    mainnet: "https://mainnet.vechain.org",
    testnet: "https://testnet.vechain.org"
};
class VeWorld {
    constructor(network, rpc) {
        this.name = "VeWorld";
        this.network = network;
        this.kit = new DAppKit({
            nodeUrl: rpc || DefaultProvider[network] || "",
            genesis: (network === "mainnet") ? 'main' : 'test'
        });
        this.kit.wallet.setSource('veworld');
    }
    // standard function
    async getChainId() {
        return 0;
    }
    async getAccounts() {
        let { account } = await this.kit.wallet.connect();
        return [account];
    }
    async sendTransaction(clauses, sender) {
        let tx = this.kit.vendor.sign('tx', clauses).signer(sender);
        let { txid } = await tx.request();
        return txid;
    }
    // customized function
    async generateUserLockData(crossScAddr, smgID, tokenPairID, crossValue, userAccount, extInfo) {
        let clauses = [Clause.callFunction(Address.of(crossScAddr), ABIContract.ofAbi(wanBridgeAbi).getFunction('userLock'), [smgID, tokenPairID, new BigNumber(crossValue).toFixed(0), userAccount], VET.of(new BigNumber(extInfo.coinValue).toFixed(0), Units.wei))];
        return clauses;
    }
    async generatorErc20ApproveData(erc20Addr, spenderAddr, value) {
        let clauses = [Clause.callFunction(Address.of(erc20Addr), ABIContract.ofAbi(erc20Abi).getFunction('approve'), [spenderAddr, new BigNumber(value).toFixed(0)])];
        return clauses;
    }
    async generateUserBurnData(crossScAddr, smgID, tokenPairID, crossValue, fee, tokenAccount, userAccount, extInfo) {
        let clauses = [Clause.callFunction(Address.of(crossScAddr), ABIContract.ofAbi(wanBridgeAbi).getFunction('userBurn'), [smgID, tokenPairID, new BigNumber(crossValue).toFixed(0), new BigNumber(fee).toFixed(0), tokenAccount, userAccount], VET.of(new BigNumber(extInfo.coinValue).toFixed(0), Units.wei))];
        return clauses;
    }
}
export default VeWorld;
