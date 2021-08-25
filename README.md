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
        smgs: [], // available storeman groups
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
      txHash,
      status    // "Succeeded" or "Error"
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

wanchain-cross-sdk supports polkadot{.js}, MetaMask, WanMask and other web3-compatible wallets, you should select them to connect according to the chain you plan to send transactions.
```javascript
// connect to the wallet in your own way and get the provider, such as:
let metaMaskWallet = window.ethereum;
let wanMaskWallet = window.wanchain;

// SDK provides an easy way to use polkadot{.js} wallet, you can only provide url instead of provider
let polkadotWallet = "wss://nodes-testnet.wandevs.org/polkadot";
```
SDK does not support BTC, LTC or XRP wallets, when you convert asset from Bitcoin, Litecoin or XRP Ledger to other chains, please use a third-party wallet to send the asset to the ota address manually.

Step 4: Select a asset pair and create cross-chain task.

```javascript
try {
  // select a asset pair from assetPairs, and choose "mint" or "brun" direction
  // each asset pair contains fromChain and toChain, if the asset is converted from fromChain to toChain, the direction is "mint", otherwise, the direction is "burn"
  let assetPair = assetPairs[0];

  // create a wallet according fromChain of assetPair, the wallet type can be "MetaMask", "WanMask", "WalletConnect", "OtherWeb3" or "polkadot{.js}"
  // no need to create this wallet when converting assets from Bitcoin, Litecoin or XRP Ledger
  let wallet = new Wallet("MetaMask", metaMaskWallet);

  // check wallet network
  let checkWallet = await bridge.checkWallet(assetPair, "mint", wallet);
  if (checkWallet === false) {
    throw "Invalid wallet or network";
  }

  // for polkadot, you can call wallet.getAccounts() to get all accounts and then select one as fromAccount
  let fromAccount = "sender-address-on-from-chain";

  // input toAccount and amount manully
  let toAccount = 'receiver-address-on-to-chain';
  let amount = 0.1;

  // check to-address format
  let validTo = bridge.validateToAccount(assetPair, "mint", toAccount);
  if (validTo === false) {
    throw "Invalid to-address";
  }

  // check asset balance
  let balance = await bridge.getAccountAsset(assetPair, "mint", fromAccount);
  if (balance < amount) {
    throw "Insufficient balance";
  }

  // check storeman group quota
  let quota = await bridge.getQuota(assetPair, "mint");
  if (amount < quota.minQuota) {
    throw "Less than minQuota";
  } else if (amount > quota.maxQuota) {
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
    "Amount is too small to pay the network fee"
    "Smg timeout"
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

You can call bridge.cancelTask(task.id) at an appropriate time to cancel the task, it only changes the task state, but does not stop the task.

A cross-chain task can be in the following states: 
<li>Performing: Start running task
<li>Converting: Lock transaction has been sent
<li>Succeeded:  Redeem transaction has been sent and the task has been successfully completed
<li>Failed:     Failed to finish the task
<li>Error:      The task is completed but incorrect, the asset is not transferred to the account specified by the user
<li>Rejected:   Task is cancelled

Do not close or refresh the web page before receiving the "locked" event, otherwise the task will stop and cannot be resumed.

Step 5: Get transaction records.

You can call bridge.getHistory(taskId) at any time to get the transaction records of all tasks or one task, and the records are saved in the browser's local storage.