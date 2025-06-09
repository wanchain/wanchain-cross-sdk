const { ABIContract, Address, Clause, VET, Units } = require('@vechain/sdk-core');
const { DAppKit } = require('@vechain/dapp-kit');
const wanBridgeAbi = require("../abi/crossDelegate.json");
const erc20Abi = require("../abi/erc20.json");

const DefaultProvider = {
  mainnet: "https://mainnet.vechain.org",
  testnet: "https://testnet.vechain.org"
}

class VeWorld {
  constructor(network, rpc) {
    this.name = "VeWorld";
    this.network = network;
    this.kit = new DAppKit({ // { thor, vendor, wallet }
      nodeUrl: rpc || DefaultProvider[network] || "",
      genesis: (network === "mainnet")? 'main' : 'test'
    });
    this.kit.wallet.setSource('veworld');
  }

  // standard function

  async getChainId() {
    return 0;
  }

  async getAccounts() {
    let {account} = await this.kit.wallet.connect();
    return [account];
  }

  async sendTransaction(clauses, sender) {
    let tx = this.kit.vendor.sign('tx', clauses).signer(sender);
    let { txid } = await tx.request();
    return txid;
  }

  // customized function

  async generateUserLockData(crossScAddr, smgID, tokenPairID, crossValue, userAccount, extInfo) {
    let clauses = [Clause.callFunction(
      Address.of(crossScAddr),
      ABIContract.ofAbi(wanBridgeAbi).getFunction('userLock'),
      [smgID, tokenPairID, crossValue, userAccount],
      VET.of(extInfo.coinValue, Units.wei)
    )];
    return clauses;
  }

  async generatorErc20ApproveData(erc20Addr, spenderAddr, value) {
    let clauses = [Clause.callFunction(
      Address.of(erc20Addr),
      ABIContract.ofAbi(erc20Abi).getFunction('approve'),
      [spenderAddr, value]
    )];
    return clauses;
  }

  async generateUserBurnData(crossScAddr, smgID, tokenPairID, crossValue, fee, tokenAccount, userAccount, extInfo) {
    let clauses = [Clause.callFunction(
      Address.of(crossScAddr),
      ABIContract.ofAbi(wanBridgeAbi).getFunction('userBurn'),
      [smgID, tokenPairID, crossValue, fee, tokenAccount, userAccount],
      VET.of(extInfo.coinValue, Units.wei)
    )];
    return clauses;
  }
}

module.exports = VeWorld;