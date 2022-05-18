const BigNumber = require("bignumber.js");
const tool = require("../../../utils/tool");

class TronLink {
  constructor(type, provider) {
    if (!['mainnet', 'testnet', 'nile'].includes(provider)) {
      throw new Error("Invalid provider, should be 'mainnet', 'testnet' or 'nile'");
    }
    this.type = type;
    this.tronWeb = window.tronWeb;
    console.log("tronWeb: %O", window.tronWeb)
  }

  // standard function

  async getChainId() {
    return 0;
  }

  async getAccounts(network) {
    if (this.tronWeb && this.tronWeb.defaultAddress) {
      let accounts = [this.tronWeb.defaultAddress.base58];
      return accounts;
    } else {
      console.error("TronLink not installed or not allowed");
      throw new Error("Not installed or not allowed");
    }
  }

  async getBalance(addr) {
    let balance = await this.tronWeb.trx.getBalance(addr);
    return balance;
  }

  async sendTransaction(tx, sender) {
    let signedTx = await this.tronWeb.trx.sign(tx);
    let result = await this.tronWeb.trx.sendRawTransaction(signedTx);
    return result.transaction.txID;
  }

  // customized function

  async generateUserLockData(crossScAddr, smgID, tokenPairID, crossValue, userAccount, coinValue) {
    let options = {
      feeLimit: 100000000,
      callValue: new BigNumber(coinValue).toFixed(), // tx coin value
    };
    let fn = "userLock(bytes32,uint256,uint256,bytes)"; // userLock(bytes32 smgID, uint tokenPairID, uint value, bytes userAccount)
    let params = [
      {type: 'bytes32', value: smgID},
      {type: 'uint256', value: tokenPairID},
      {type: 'uint256', value: new BigNumber(crossValue).toFixed()},
      {type: 'bytes', value: userAccount}
    ];
    let sc = tool.getStandardAddressInfo("TRX", crossScAddr).native;
    let tx = await this.tronWeb.transactionBuilder.triggerSmartContract(sc, fn, options, params);
    return tx.transaction;
  }

  async generatorErc20ApproveData(erc20Addr, spenderAddr, value) {
    let options = {
      feeLimit: 100000000,
      callValue: 0, // total value
    };
    let fn = "approve(address,uint256)"; // approve(address _spender, uint256 _value)
    let params = [
      {type: 'address', value: spenderAddr},
      {type: 'uint256', value: "0x" + new BigNumber(value).toString(16)},
    ];
    let sc = tool.getStandardAddressInfo("TRX", erc20Addr).native;
    let tx = await this.tronWeb.transactionBuilder.triggerSmartContract(sc, fn, options, params);
    return tx.transaction;
  }

  async generateUserBurnData(crossScAddr, smgID, tokenPairID, crossValue, fee, tokenAccount, userAccount, coinValue) {
    let options = {
      feeLimit: 100000000,
      callValue: new BigNumber(coinValue).toFixed(), // tx coin value
    };
    let fn = "userBurn(bytes32,uint256,uint256,uint256,address,bytes)"; // userBurn(bytes32 smgID, uint tokenPairID, uint value, uint fee, address tokenAccount, bytes userAccount)
    let params = [
      {type: 'bytes32', value: smgID},
      {type: 'uint256', value: tokenPairID},
      {type: 'uint256', value: "0x" + new BigNumber(crossValue).toString(16)},
      {type: 'uint256', value: "0x" + new BigNumber(fee).toString(16)},
      {type: 'address', value: tokenAccount},
      {type: 'bytes', value: userAccount}
    ];
    let sc = tool.getStandardAddressInfo("TRX", crossScAddr).native;
    let tx = await this.tronWeb.transactionBuilder.triggerSmartContract(sc, fn, options, params);
    return tx.transaction;
  }
}

module.exports = TronLink;