import { CrossChainApi, initNetwork, getCoinPublicKeyFromShieldAddress } from 'midnight-crosschain';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { createBalancedTx } from '@midnight-ntwrk/midnight-js-types';
import { Transaction } from '@midnight-ntwrk/ledger';
import { Transaction as ZswapTransaction } from '@midnight-ntwrk/zswap';
import { getLedgerNetworkId, getZswapNetworkId } from '@midnight-ntwrk/midnight-js-network-id';

const apiConfig = {
  testnet: {
    contractAddress: '0200925989bf8b91a6841b6808e83c841881a4b4fdf9d3abc64d73c6d272d0fc28af',
    indexerUri: 'https://indexer.testnet-02.midnight.network/api/v1/graphql',
    indexerWsUri: 'wss://indexer.testnet-02.midnight.network/api/v1/graphql/ws',
    // node: 'https://rpc.testnet-02.midnight.network',
    proverServerUri: 'http://44.229.225.45:6300'
  }
}

const api = new CrossChainApi();

let providersCache = null;

async function initializeProviders(network, wallet) {
  const cfg = apiConfig[network];
  const zkConfigPath = window.location.origin + '/dist';
  providersCache = providersCache || {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: 'crosschain-state',
    }),
    zkConfigProvider: new FetchZkConfigProvider(zkConfigPath, fetch.bind(window)),
    proofProvider: httpClientProofProvider(cfg.proverServerUri),
    publicDataProvider: indexerPublicDataProvider(cfg.indexerUri, cfg.indexerWsUri)
  };
  if (wallet) {
    const walletState = await wallet.state();
    providersCache.walletProvider = {
      coinPublicKey: walletState.coinPublicKey,
      encryptionPublicKey: walletState.encryptionPublicKey,
      balanceTx(tx, newCoins) {
        return wallet
          .balanceAndProveTransaction(
            ZswapTransaction.deserialize(tx.serialize(getLedgerNetworkId()), getZswapNetworkId()),
            newCoins,
          )
          .then((zswapTx) => Transaction.deserialize(zswapTx.serialize(getZswapNetworkId()), getLedgerNetworkId()))
          .then(createBalancedTx);
      }
    };
    providersCache.midnightProvider = {
      submitTx(tx) {
        return wallet.submitTransaction(tx);
      }
    };
  } else {
    providersCache.walletProvider = undefined;
    providersCache.midnightProvider = undefined;
  }
  return providersCache;
};

async function setApiProviders(network, wallet = null) {
  let isInit = !providersCache;
  await initializeProviders(network, wallet);
  await api.init(providersCache);
  if (isInit) {
    initNetwork(network === 'testnet'? 2 : 0);
    await api.join(apiConfig[network].contractAddress);
  }
}

// WAValidator can not valid testnet address
function validateAddress(address, options = {}) {
}
function getStandardAddressInfo(address) {
}
// function deserializeTx(hex) {
//   return createUnbalancedTx(Transaction.deserialize(Uint8Array.from(Buffer.from(hex, 'hex')), 2));
// }
async function getUserFeeBalance(address) {
  let ledgerState = await api.getLedgerState();
  let userBytes = getCoinPublicKeyFromShieldAddress(address);
  console.log("address %s %O ledgerState: %O", address, userBytes, ledgerState);
  let balance = ledgerState.userFeeBalance.lookup({ bytes: userBytes });
  console.log("getUserFeeBalance %s: %O", address, balance);
  return balance;
}
async function checkClaimable(uniqueId, isNative) {
  let ledgerState = await api.getLedgerState();
  let data = isNative ? ledgerState.coinToBeClaimed : ledgerState.mappingTokenToBeClaim;
  const result = data.lookup({ bytes: new Uint8Array(Buffer.from(uniqueId.slice(2), 'hex')) });
  console.log("checkClaimable %s %s: %O", uniqueId, isNative, result);
  return result;
}
export { api };
export { setApiProviders };
export { validateAddress };
export { getStandardAddressInfo };
// export { deserializeTx };
export { getUserFeeBalance };
export { checkClaimable };
export default {
  api,
  setApiProviders,
  validateAddress,
  // getStandardAddressInfo,
  // deserializeTx,
  getUserFeeBalance,
  checkClaimable
};
