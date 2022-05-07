const BigNumber = require("bignumber.js");

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

  async generateUserLockTx(crossScAddr, smgID, tokenPairID, netValue, userAccount, fee) {
    let options = {
      feeLimit: 100000000,
      callValue: new BigNumber(netValue).plus(fee).toFixed(), // total value
    };
    let fn = "userLock(bytes32,uint256,uint256,bytes)"; // userLock(bytes32 smgID, uint tokenPairID, uint value, bytes userAccount)
    let params = [
      {type: 'bytes32', value: smgID},
      {type: 'uint256', value: tokenPairID},
      {type: 'uint256', value: new BigNumber(netValue).toFixed()},
      {type: 'bytes', value: userAccount}
    ];
    let tx = await this.tronWeb.transactionBuilder.triggerSmartContract(crossScAddr, fn, options, params);
    return tx.transaction;
  }

  
}

module.exports = TronLink;