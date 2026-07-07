import { CrossChainApi, initNetwork, getUserAddressFromUnshieldAddress, getUnshieldAddressFromUserAddress } from 'midnight-crosschain';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { Transaction } from '@midnight-ntwrk/ledger-v8';
import { PrivateStateProvider } from './privateStateProvider.js';
import { fromHex, toHex } from '@midnight-ntwrk/compact-runtime';
import axios from "axios";

const apiConfig = {
  testnet: {
    contractAddress: 'e18145baaee32c097b65a7a8100f196cef5790c07e1814d62a309c9a082837ae',
    indexerUri: 'https://indexer.preprod.midnight.network/api/v4/graphql',
    indexerWsUri: 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws',
    // node: 'https://rpc.preprod.midnight.network',
    // proverServerUri: 'https://proof-server.preprod.midnight.network'
    proverServerUri: 'https://nodes-testnet.wandevs.org/proof-server-midnight'
  }
}

const api = new CrossChainApi();

let providersCache = null;

async function initializeProviders(network, wallet) {
  let cfg = apiConfig[network];
  if (!providersCache) {
    let zkConfigProvider = new FetchZkConfigProvider(window.location.origin + '/chains/midnight', fetch.bind(window));
    providersCache = {
      privateStateProvider: PrivateStateProvider(),
      zkConfigProvider,
      proofProvider: httpClientProofProvider(cfg.proverServerUri, zkConfigProvider),
      publicDataProvider: indexerPublicDataProvider(cfg.indexerUri, cfg.indexerWsUri)
    }
  };
  if (wallet) {
    let config = await wallet.getConfiguration();
    let proverServerUri = config.proverServerUri;
    if (proverServerUri !== 'http://localhost:6300') {
      proverServerUri = cfg.proverServerUri; // public uri is unavailable
    }
    providersCache.proofProvider = httpClientProofProvider(proverServerUri, providersCache.zkConfigProvider);
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
    providersCache.proofProvider = undefined;
    providersCache.walletProvider = undefined;
    providersCache.midnightProvider = undefined;
  }
  return providersCache;
};

async function setApiProviders(network, wallet = null) {
  initNetwork((network === 'mainnet') ? "mainnet" : "preprod");
  let isInit = !providersCache;
  await initializeProviders(network, wallet);
  await api.init(providersCache);
  if (isInit) {
    await api.join(apiConfig[network].contractAddress);
  }
}

function validateAddress(address, options) {
  try {
    let userAddr = getUserAddressFromUnshieldAddress(address);
    let network = (options.network === 'mainnet') ? "mainnet" : "preprod";
    let unshieldAddr = getUnshieldAddressFromUserAddress(Buffer.from(userAddr).toString("hex"), network);
    return (unshieldAddr === address);
  } catch (err) {
    // console.error("midnight validateAddress %s error: %O", address, err);
    return false;
  }
}

async function getTxReceipt(network, txHash) {
  let query = `{
    transactions(offset: { hash: "${txHash}" }) {
      block {
        height
        hash
      }
    }
  }`;
  let res = await axios.post(apiConfig[network].indexerUri, { query });
  return res.data.data.transactions[0];
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
export { getTxReceipt };
export { checkRedeemed };

export default {
  api,
  setApiProviders,
  validateAddress,
  getTxReceipt,
  checkRedeemed
};
