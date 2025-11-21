import { Transaction } from '@midnight-ntwrk/ledger';
import { createUnbalancedTx } from '@midnight-ntwrk/midnight-js-types';
// WAValidator can not valid testnet address
function validateAddress(address, options = {}) {
}
function getStandardAddressInfo(address) {
}
function deserializeTx(hex) {
  return createUnbalancedTx(Transaction.deserialize(Uint8Array.from(Buffer.from(hex, 'hex')), 2));
}
async function getUserFeeBalance(address) {
  let ledgerState = await this.getLedgerState();
  let balance = ledgerState.userFeeBalance.lookup({ bytes: getCoinPublicKeyFromShieldAddress(address) });
  console.log("getUserFeeBalance %s: %O", address, balance);
  return balance;
}
async function checkClaimable(uniqueId, isNative) {
  let ledgerState = await this.getLedgerState();
  let data = isNative ? ledgerState.coinToBeClaimed : ledgerState.mappingTokenToBeClaim;
  const result = data.lookup({ bytes: new Uint8Array(Buffer.from(uniqueId.slice(2), 'hex')) });
  console.log("checkClaimable %s %s: %O", uniqueId, isNative, result);
  return result;
}
export { validateAddress };
export { getStandardAddressInfo };
export { deserializeTx };
export { getUserFeeBalance };
export { checkClaimable };
export default {
  validateAddress,
  // getStandardAddressInfo,
  deserializeTx,
  getUserFeeBalance,
  checkClaimable
};
