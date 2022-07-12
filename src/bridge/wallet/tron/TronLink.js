const BigNumber = require("bignumber.js");
const tool = require("../../../utils/tool");

const TxResource = {
  approveBandwidth: 345,
  approveEnergy: 22495,
  lockBandwidth: 480,
  lockEnergy: 43267, // TRX: 17202, Token: 43267
  burnBandwidth: 571,
  burnEnergy: 41505,
}

class TronLink {
  constructor(type, provider) {
    if (!['mainnet', 'testnet', 'nile'].includes(provider)) {
      throw new Error("Invalid provider, should be 'mainnet', 'testnet' or 'nile'");
    }
    this.type = type;
    this.tronWeb = window.tronWeb;
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
      console.error("%s not installed or not allowed", this.type);
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
    let chainParas = await this.tronWeb.trx.getChainParameters();
    // console.debug({chainParas});
    let bandwidthFee = new BigNumber(chainParas.find(v => v.key === 'getTransactionFee').value).times(TxResource.lockBandwidth);
    let energeFee = new BigNumber(chainParas.find(v => v.key === 'getEnergyFee').value).times(TxResource.lockEnergy);
    let options = {
      feeLimit: bandwidthFee.plus(energeFee).times(2).toFixed(),
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
    let chainParas = await this.tronWeb.trx.getChainParameters();
    // console.debug({chainParas});
    let bandwidthFee = new BigNumber(chainParas.find(v => v.key === 'getTransactionFee').value).times(TxResource.approveBandwidth);
    let energeFee = new BigNumber(chainParas.find(v => v.key === 'getEnergyFee').value).times(TxResource.approveEnergy);
    let options = {
      feeLimit: bandwidthFee.plus(energeFee).times(2).toFixed(),
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
    let chainParas = await this.tronWeb.trx.getChainParameters();
    // console.debug({chainParas});
    let bandwidthFee = new BigNumber(chainParas.find(v => v.key === 'getTransactionFee').value).times(TxResource.burnBandwidth);
    let energeFee = new BigNumber(chainParas.find(v => v.key === 'getEnergyFee').value).times(TxResource.burnEnergy);
    let options = {
      feeLimit: bandwidthFee.plus(energeFee).times(2).toFixed(),
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