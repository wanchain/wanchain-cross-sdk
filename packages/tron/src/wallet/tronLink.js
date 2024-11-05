const BigNumber = require("bignumber.js");
const tool = require("../tool");

class TronLink {
  constructor(provider) {
    this.name = "TronLink";
    if (!['mainnet', 'testnet', 'nile'].includes(provider)) {
      throw new Error("Invalid provider, should be 'mainnet', 'testnet' or 'nile'");
    }
    this.tronWeb = window.tronWeb;
    this.tronLink = window.tronLink; // chrome v3.22.0 and later inject tronLink object
  }

  // standard function

  async getChainId() {
    return 0;
  }

  async getAccounts(network) {
    if (this.tronLink) {
      // only authorize, not return accounts, this.tronWeb.trx.getAccount do not support reconnetct after reject
      await this.tronLink.request({method: 'tron_requestAccounts'});
    }
    if (this.tronWeb && this.tronWeb.defaultAddress && this.tronWeb.defaultAddress.base58) {
      return [this.tronWeb.defaultAddress.base58];
    } else {
      console.error("%s not installed or unavailable", this.name);
      throw new Error("Not installed or unavailable");
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

  async generateUserLockData(crossScAddr, smgID, tokenPairID, crossValue, userAccount, extInfo) {
    let fn = "userLock(bytes32,uint256,uint256,bytes)"; // userLock(bytes32 smgID, uint tokenPairID, uint value, bytes userAccount)
    let params = [
      {type: 'bytes32', value: smgID},
      {type: 'uint256', value: tokenPairID},
      {type: 'uint256', value: new BigNumber(crossValue).toFixed()},
      {type: 'bytes', value: userAccount}
    ];
    let sc = tool.getStandardAddressInfo(crossScAddr).native;
    let options = {callValue: new BigNumber(extInfo.coinValue).toFixed()}; // tx coin value
    let feeLimit = await this.estimateFeeLimit(sc, fn, options, params);
    options.feeLimit = feeLimit;
    let tx = await this.tronWeb.transactionBuilder.triggerSmartContract(sc, fn, options, params);
    return tx.transaction;
  }

  async generatorErc20ApproveData(erc20Addr, spenderAddr, value) {
    let fn = "approve(address,uint256)"; // approve(address _spender, uint256 _value)
    let params = [
      {type: 'address', value: spenderAddr},
      {type: 'uint256', value: "0x" + new BigNumber(value).toString(16)},
    ];
    let sc = tool.getStandardAddressInfo(erc20Addr).native;
    let options = {callValue: 0};
    let feeLimit = await this.estimateFeeLimit(sc, fn, options, params);
    options.feeLimit = feeLimit;
    let tx = await this.tronWeb.transactionBuilder.triggerSmartContract(sc, fn, options, params);
    return tx.transaction;
  }

  async generateUserBurnData(crossScAddr, smgID, tokenPairID, crossValue, fee, tokenAccount, userAccount, extInfo) {
    let fn = "userBurn(bytes32,uint256,uint256,uint256,address,bytes)"; // userBurn(bytes32 smgID, uint tokenPairID, uint value, uint fee, address tokenAccount, bytes userAccount)
    let params = [
      {type: 'bytes32', value: smgID},
      {type: 'uint256', value: tokenPairID},
      {type: 'uint256', value: "0x" + new BigNumber(crossValue).toString(16)},
      {type: 'uint256', value: "0x" + new BigNumber(fee).toString(16)},
      {type: 'address', value: tokenAccount},
      {type: 'bytes', value: userAccount}
    ];
    let sc = tool.getStandardAddressInfo(crossScAddr).native;
    let options = {callValue: new BigNumber(extInfo.coinValue).toFixed()}; // tx coin value
    let feeLimit = await this.estimateFeeLimit(sc, fn, options, params);
    options.feeLimit = feeLimit;
    let tx = await this.tronWeb.transactionBuilder.triggerSmartContract(sc, fn, options, params);
    return tx.transaction;
  }

  async estimateFeeLimit(sc, fn, options, params) {
    // estimate energy
    const estimateEnergy = await this.tronWeb.transactionBuilder.triggerConstantContract(sc, fn, {callValue: options.callValue}, params, this.tronWeb.defaultAddress.base58);
    if (estimateEnergy.result.result !== true) {
      console.error("estimateEnergy: %O", estimateEnergy);
      throw new Error("estimate energy error");
    }
    // estimate bandwidth
    let DATA_HEX_PROTOBUF_EXTRA = 3;
    let MAX_RESULT_SIZE_IN_TX = 64;
    let A_SIGNATURE = 67;
    let CORRECTION = 6; // actually consume more 6 than estimate, may be it is the different between signed and unsigned tx
    let estimateBandwidth = (estimateEnergy.transaction.raw_data_hex.length / 2) + DATA_HEX_PROTOBUF_EXTRA + MAX_RESULT_SIZE_IN_TX + A_SIGNATURE + CORRECTION; // only consider 1 signature
    console.log({estimateBandwidth, estimateEnergy: estimateEnergy.energy_used});
    // cal fee limit by price
    let chainParas = await this.tronWeb.trx.getChainParameters();
    // console.debug({chainParas});
    let bandwidthFee = new BigNumber(chainParas.find(v => v.key === 'getTransactionFee').value).times(estimateBandwidth);
    let energeFee = new BigNumber(chainParas.find(v => v.key === 'getEnergyFee').value).times(estimateEnergy.energy_used);
    return bandwidthFee.plus(energeFee).times(1.2).toFixed(0);
  }
}

module.exports = TronLink;