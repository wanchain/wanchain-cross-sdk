wanchain-cross-sdk
========

SDK for executing cross-chain transactions based on WanBridge.

## Installation
Use NPM or Yarn to install the package:
```bash
npm install --save wanchain-cross-sdk
```
## Prerequisites
<li>wanchain-cross-sdk relies on iWan service, accessed through API key, you can apply from iWan website.

[iWan](https://iwan.wanchain.org)

<li>Install wallets extension for your browser, such as:

[MetaMask](https://chrome.google.com/webstore/detail/metamask/nkbihfbeogaeaoehlefnkodbefgpgknn),
[WanMask](https://github.com/wanchain/wanmask) and [polkadot{.js}](https://chrome.google.com/webstore/detail/polkadot%7Bjs%7D-extension/mopnmbcafieddcagagdcbnhejhlodfdd).

<li>Install BTC, LTC and XRP wallets if you need to convert asset from Bitcoin, Litecoin or XRP Ledger.

<li>Or use Truffle HDWallet to sign and send transactions in Node.js script.

[HDWalletProvider](https://www.npmjs.com/package/@truffle/hdwallet-provider)

## Usage
Step 1: Import WanBridge and Wallet, create a bridge object and subscribe to events.

```javascript
import { WanBridge, Wallet } from 'wanchain-cross-sdk'

let bridge = new WanBridge("testnet"); // testnet or mainnet
bridge.on("ready", assetPairs => {
  /* the bridge is initialized successfully and is ready for cross-chain, you can filter assetPairs by asset and chain type as needed.
    assetPairs example: [
      {
        assetPairId: "39",
        assetType: "AVAX",
        decimals: "18",
        fromChainName: "Avalanche C-Chain",
        fromChainType: "AVAX",
        fromSymbol: "AVAX",
        toChainName: "Wanchain",
        toChainType: "WAN",
        toSymbol: "wanAVAX"
      },
      ......
    ]
  */
}).on("error", info => {
  /* failed to initialize the bridge, or cross-chain task failed.
    error info structure: {
      taskId, // optional, only task error info has taskId field
      reason
    }
    a task error info may includes the following reason:
    "Invalid wallet"
    "Failed to send transaction"
    "Rejected"
    "Insufficient ERC20 token allowance"
    "Insufficient balance"
    "Failed to approve token"
    "Failed to generate ota"
    "Transaction failed"
    "Amount is too small to pay the fee"
    "Waiting for locking asset timeout"
    "Please contact the Wanchain Foundation (techsupport@wanchain.org)"
  */
}).on("ota", info => {
  /* the one-time-addess is generated to receive BTC, LTC or XRP.
    ota info structure: {
      taskId,
      address:, // BTC/LTC ota address, or XRP xAddress
      rAddress, // optional, XRP rAddress
      tagId     // optional, XRP tag ID
    }
  */
}).on("lock", info => {
  /* the lock transaction hash
    lock info structure: {
      taskId,
      txHash
    }
  */
}).on("redeem", info => {
  /* the redeem transaction hash, indicates that the cross-chain task is finished.
    redeem info structure: {
      taskId,
      txHash
    }
  */
});
```
Step 2: Initialize the bridge with your API key.

```javascript
let iwanAuth = {
  apiKey: "your-api-key",
  secretKey: "your-secret-key"
};

bridge.init(iwanAuth);
```

Step 3: Connect a wallet.

SDK for browser supports polkadot{.js}, MetaMask, WanMask and other web3-compatible wallets, you should select them to connect according to the chain you plan to send transactions.
```javascript
// connect to the wallet in your own way and get the provider, such as:
let metaMaskWallet = window.ethereum;
let wanMaskWallet = window.wanchain;

// SDK provides an easy way to use polkadot{.js} wallet, you can only provide url instead of provider
let polkadotWallet = "wss://westend-rpc.polkadot.io";
```
SDK for Node.js currently only supports Truffle HDWallet.
```javascript
const HDWalletProvider = require("@truffle/hdwallet-provider");

const hdWallet = new HDWalletProvider({
  privateKeys: ["your-private-key"],
  providerOrUrl
});
```
SDK does not support BTC, LTC or XRP wallets, when you convert asset from Bitcoin, Litecoin or XRP Ledger to other chains, please use a third-party wallet to send the asset to the ota address manually.

Step 4: Select a asset pair and create cross-chain task.

```javascript
try {
  // select a asset pair from assetPairs, and choose "mint" or "brun" direction
  // each asset pair contains fromChain and toChain, if the asset is converted from fromChain to toChain, the direction is "mint", otherwise, the direction is "burn"
  let assetPair = assetPairs[0];

  // create a wallet according fromChain of assetPair, the wallet type can be "MetaMask", "WanMask", "WalletConnect", "WanWallet" or "polkadot{.js}" for browser, and "TruffleHD" for Node.js.
  // no need to create this wallet when converting assets from Bitcoin, Litecoin or XRP Ledger
  let wallet = new Wallet("MetaMask", metaMaskWallet);

  // check wallet network
  let checkWallet = await bridge.checkWallet(assetPair, "mint", wallet);
  if (checkWallet === false) {
    throw "Invalid wallet or network";
  }

  // for polkadot, you can call wallet.getAccounts(network) to get all accounts and then select one as fromAccount
  let fromAccount = "sender-address-on-from-chain";

  // input toAccount and amount manully
  let toAccount = 'receiver-address-on-to-chain';
  let amount = new BigNumber(0.1);

  // check to-address format
  let validTo = bridge.validateToAccount(assetPair, "mint", toAccount);
  if (validTo === false) {
    throw "Invalid to-address";
  }

  // check asset balance
  let balance = await bridge.getAccountAsset(assetPair, "mint", fromAccount);
  if (amount.gt(balance)) {
    throw "Insufficient balance";
  }

  // check storeman group quota
  let quota = await bridge.getQuota(assetPair, "mint");
  if (amount.lt(quota.minQuota)) {
    throw "Less than minQuota";
  } else if (amount.gt(quota.maxQuota)) {
    throw "Exceed maxQuota";
  }

  // if the user accepts the fee, create a task
  let fee = await bridge.estimateFee(assetPair, "mint");

  // create a task
  let task = await bridge.createTask(assetPair, 'mint', amount, fromAccount, toAccount, wallet);
} catch(err) {
  console.error(err);
  /* createTask will check the task context and may throw the following error:
    "Invalid fromAccount"
    "Missing fromAccount"
    "Invalid toAccount"
    "Missing wallet"
    "Invalid wallet"
    "Amount is too small to pay the fee"
    "Smg unavailable"
    "Less than minQuota"
    "Exceed maxQuota"
    "Amount is too small to activate smg"
    "Insufficient balance"
    "Amount is too small to activate toAccount"
    "Insufficient gas"
    "Insufficient asset"
    "Unknown error"
  */
}
```
The tasks will be automatically scheduled, once it is successfully completed, the "redeem" event will be emitted, if it fails, the "error" event will be emitted.

You can call bridge.cancelTask(task.id) at an appropriate time to cancel the task, it only changes the task status, but does not stop the task.

A cross-chain task can be in the following statuses:
<li>Performing: Start running task
<li>Converting: Lock transaction has been sent
<li>Succeeded:  Redeem transaction has been sent and the task has been successfully completed
<li>Failed:     Failed to finish the task
<li>Error:      The task is completed but incorrect, the asset is not transferred to the account specified by the user
<li>Rejected:   Task is cancelled
<li>Timeout:    Waiting for locking asset more than 24 hours

Do not close or refresh the web page before receiving the "lock" event, otherwise the task will stop and cannot be resumed.

Step 5: Get transaction records.

You can call bridge.getHistory(taskId) at any time to get the transaction records of all tasks or one task, and the records are saved in the browser's local storage.