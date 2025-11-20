// const { CrossChainApi } = require('./midnight-crosschain/dist/index.js');

import { CrossChainApi, getCoinPublicKeyFromShieldAddress } from 'midnight-crosschain';

// class CrossChainApi {
//   async init(config) {
//     console.log("api init: %O", config);
//   }

//   async join(sc) {
//     console.log("api join: %O", sc);
//   }
// }

const apiConfig = {
  testnet: {
    contractAddress: '0200977b217a300ca8ef78c088a39028341c1845ef11edda84d43c28d3334cd76863',
    indexer: 'https://indexer.testnet-02.midnight.network/api/v1/graphql',
    indexerWS: 'wss://indexer.testnet-02.midnight.network/api/v1/graphql/ws',
    node: 'https://rpc.testnet-02.midnight.network',
    proofServer: 'http://44.229.225.45:6300'
  }
}

const api = new CrossChainApi();

async function initApi(network) {
  let config = apiConfig[network];
  await api.init(config);
  await api.join(config.contractAddress);
}

// WAValidator can not valid testnet address
function validateAddress(address, options = {}) { // options: {network, chain, retScriptHash}
}

function getStandardAddressInfo(address) {
}

async function getUserFeeBalance(address) {
  let ledgerState = await this.getLedgerState();
  let balance = ledgerState.userFeeBalance.lookup({ bytes: getCoinPublicKeyFromShieldAddress(address) });
  console.log("getUserFeeBalance %s: %O", address, balance);
  return balance;
}

async function checkClaimable(uniqueId, isNative) {
  let ledgerState = await this.getLedgerState();
  let data = isNative? ledgerState.coinToBeClaimed : ledgerState.mappingTokenToBeClaim;
  const result = data.lookup({ bytes: new Uint8Array(Buffer.from(uniqueId.slice(2), 'hex')) });
  console.log("checkClaimable %s %s: %O", uniqueId, isNative, result);
  return result;
}

const tools = {
  api,
  initApi,
  validateAddress,
  getStandardAddressInfo,
  getUserFeeBalance,
  checkClaimable
}

export default tools;

// module.exports = {
//   api,
//   initApi,
//   validateAddress,
//   getStandardAddressInfo
// }