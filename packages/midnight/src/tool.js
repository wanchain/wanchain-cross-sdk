import { CrossChainApi, initNetwork, getUserAddressFromUnshieldAddress } from 'midnight-crosschain';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { Transaction } from '@midnight-ntwrk/ledger-v8';
import { PrivateStateProvider } from './privateStateProvider.js';
import { fromHex, toHex } from '@midnight-ntwrk/compact-runtime';

const apiConfig = {
  testnet: {
    contractAddress: 'e18145baaee32c097b65a7a8100f196cef5790c07e1814d62a309c9a082837ae',
    indexerUri: 'https://indexer.preprod.midnight.network/api/v4/graphql',
    indexerWsUri: 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws',
    // node: 'https://rpc.preprod.midnight.network',
    // proverServerUri: 'https://proof-server.preprod.midnight.network'
    proverServerUri: 'http://35.163.105.105:6300'
  }
}

const api = new CrossChainApi();

let providersCache = null;

async function initializeProviders(network, wallet) {
  let cfg = apiConfig[network];
  let zkConfigPath = window.location.origin + '/chains/mn/zk';
  let keyMaterialProvider = new FetchZkConfigProvider(zkConfigPath, fetch.bind(window));
  providersCache = providersCache || {
    privateStateProvider: PrivateStateProvider(),
    zkConfigProvider: keyMaterialProvider,
    proofProvider: httpClientProofProvider(cfg.proverServerUri, keyMaterialProvider),
    publicDataProvider: indexerPublicDataProvider(cfg.indexerUri, cfg.indexerWsUri)
  };
  if (wallet) {
    let shieldedAddresses = await wallet.getShieldedAddresses();
    providersCache.walletProvider = {
      getCoinPublicKey() {
        return shieldedAddresses.shieldedCoinPublicKey;
      },
      getEncryptionPublicKey() {
        return shieldedAddresses.shieldedEncryptionPublicKey;
      },
      async balanceTx(tx) {
        try {
          let serializedTx = toHex(tx.serialize());
          let received = await wallet.balanceUnsealedTransaction(serializedTx);
          let result = Transaction.deserialize(
            'signature',
            'proof',
            'binding',
            fromHex(received.tx),
          );
          return result;
        } catch (err) {
          console.error("balanceTx error: %O", err);
          throw err;
        }
      }
    };
    providersCache.midnightProvider = {
      async submitTx(tx) {
        await wallet.submitTransaction(toHex(tx.serialize()));
        let txIdentifiers = tx.identifiers();
        let txId = txIdentifiers[0]; // Return the first transaction ID
        return txId;
      }
    };
  } else {
    providersCache.walletProvider = undefined;
    providersCache.midnightProvider = undefined;
  }
  return providersCache;
};

async function setApiProviders(network, wallet = null) {
  initNetwork(network === 'mainnet' ? "mainnet" : "preprod");
  let isInit = !providersCache;
  await initializeProviders(network, wallet);
  await api.init(providersCache);
  if (isInit) {
    await api.join(apiConfig[network].contractAddress);
  }
}

function validateAddress(address) {
  try {
    getUserAddressFromUnshieldAddress(address);
    return true;
  } catch (err) {
    // console.error("midnight validateAddress %s error: %O", address, err);
    return false;
  }
}

async function checkRedeemed(uniqueId) {
  let ledgerState = await api.getLedgerState();
  let data = ledgerState.crossProposalHis;
  let key = new Uint8Array(Buffer.from(uniqueId.slice(2), 'hex'));
  let result = data.member(key) ? data.lookup(key) : null;
  console.debug("DUST checkRedeemed %s: %O", uniqueId, result);
  return result;
}

export { api };
export { setApiProviders };
export { validateAddress };
export { checkRedeemed };

export default {
  api,
  setApiProviders,
  validateAddress,
  checkRedeemed
};
