const BigNumber = require('bignumber.js');
const { Transaction } = require('@mysten/sui/transactions');

function validateAddress(address) {
  return /^0x[0-9a-f]{64}$/.test(address);
}

function getStandardAddressInfo(address) { // support bs58 encoded native or decoded format
  let native = address, evm = address, cctp = address;
  return {native, evm, ascii: native, cctp};
}

function newTransaction() {
  return new Transaction();
}

function selectCoins(coins, amount) {
  if (coins.length === 0) {
    return null;
  }
  let selected = [], sumAmount = new BigNumber(0);
  for (let i = 0; i < coins.length; i++) {
    selected.push(coins[i]);
    sumAmount = sumAmount.plus(coins[i].balance);
    if (sumAmount.gte(amount)) {
      return selected;
    }
  }
  return [];
}

const tools = {
  validateAddress,
  getStandardAddressInfo,
  newTransaction,
  selectCoins
}

export default tools;