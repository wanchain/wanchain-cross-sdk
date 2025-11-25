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
    contractAddress: '0200d90f6d68a4e875ca44d2ecd925743cb28e14ff9cc59e34d7178725519414ca00',
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
  const zkConfigPath = window.location.origin + '/chains/mn/zk';
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
  initNetwork(network === 'testnet' ? 2 : 0);
  let isInit = !providersCache;
  await initializeProviders(network, wallet);
  await api.init(providersCache);
  if (isInit) {
    await api.join(apiConfig[network].contractAddress);
  }
}

function validateAddress(address) {
  try {
    getCoinPublicKeyFromShieldAddress(address);
    return true;
  } catch (err) {
    // console.error("midnight validateAddress %s error: %O", address, err);
    return false;
  }
}

async function getUserFeeBalance(address) {
  let ledgerState = await api.getLedgerState();
  let userBytes = getCoinPublicKeyFromShieldAddress(address);
  let key = { bytes: userBytes };
  let balance = ledgerState.userFeeBalance.member(key) ? ledgerState.userFeeBalance.lookup(key).toString() : 0;
  console.debug("getUserFeeBalance %s: %O", address, balance);
  return balance;
}
async function checkClaimable(uniqueId, isNative) {
  let ledgerState = await api.getLedgerState();
  let data = isNative ? ledgerState.coinToBeClaimed : ledgerState.mappingTokenToBeClaim;
  let key = { bytes: new Uint8Array(Buffer.from(uniqueId.slice(2), 'hex')) };
  let result = data.member(key) ? data.lookup(key) : null;
  console.log("checkClaimable %s %s: %O", uniqueId, isNative, result);
  return result;
}

export { api };
export { setApiProviders };
export { validateAddress };
export { getUserFeeBalance };
export { checkClaimable };

export default {
  api,
  setApiProviders,
  validateAddress,
  getUserFeeBalance,
  checkClaimable
};
