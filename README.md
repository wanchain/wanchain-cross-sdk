wanchain-cross-sdk
========

SDK for executing cross-chain transactions based on Wanchain Bridge.

## Installation
Use NPM or Yarn to install the package:
```bash
npm install --save wanchain-cross-sdk
```

## Prerequisites
<li>wanchain-cross-sdk relies on iWan service, it is accessed through api key, you can apply for api key from [iWan website](https://iwan.wanchain.org).
<li>If you plan to send transactions on Wanchain, Ethereum, BSC, Avalanche, Moonbeam or Polygon, you need to install the [MetaMask plugin](https://chrome.google.com/webstore/detail/metamask/nkbihfbeogaeaoehlefnkodbefgpgknn) for your browser.
<li>If you plan to send transactions on Polkadot, you need to install the [polkadot{.js} extension](https://chrome.google.com/webstore/detail/polkadot%7Bjs%7D-extension/mopnmbcafieddcagagdcbnhejhlodfdd) for your browser.
<br><br>

## Usage

Step 1: Import WanBridge, create a bridge object and subscribe to events.

```javascript
import { WanBridge } from 'wanchain-cross-sdk'

let bridge = new WanBridge("testnet"); // testnet or mainnet
bridge.on("ready", assetPairs => {
  // The bridge is initialized successfully and is ready for cross-chain
}).on("error", info => {
  // Failed to initialize the bridge, or cross-chain task failed
}).on("account", info => {
  // The wallet account is changed
}).on("ota", info => {
  // The one-time-addess to receive Bitcoin, Litecoin or XRP is generated
}).on("lock", info => {
  // The lock transaction hash
}).on("redeem", info => {
  // The redeem transaction hash, indicates that the cross-chain task is finished
});
```

Step 2: Initialize the bridge with your api key.

```javascript
let iwanAuth = {
  apiKey: "your-api-key",
  secretKey: "your-secret-key"
};

bridge.init(iwanAuth);
```

Step 3: Connect to MetaMask and polkadot{.js} wallet. (Optional)
<br>
If you plan to send transactions on Wanchain, Ethereum, BSC, Avalanche, Moonbeam or Polygon, you should connect to MetaMask, if you plan to send transactions on Polkadot, you should connect to polkadot{.js} wallet.
```javascript
bridge.connectMetaMask();
bridge.connectPolkadot();
```

Step 4: Choose a asset pair and create mint or burn cross-chain task.

```javascript
try {
  let assetPair = assetPairs[0];
  let fromAccount = bridge.getWalletAccount(assetPair, "mint"); // get connected wallet account
  let toAccount = 'receiver-address-on-destination-chain'
  let amount = 0.1;
  let fee = await bridge.estimateFee(assetPair, "burn");
  // If the user accepts the fee, create a task
  let task = await bridge.createTask(assetPair, 'mint', amount, fromAccount, toAccount);
} catch(err) {
  console.error(err);
}
```
The tasks will be automatically scheduled, once it is successfully completed, the "redeem" event will be emitted, if it fails, the "error" event will be emitted.

## Advanced

Inappropriate parameters may cause the cross-chain task to fail. Before creating the task, you can call some APIs to check the task parameters.

```javascript
// check to-address format
let validTo = bridge.validateToAccount(assetPair, "mint", to);
if (validTo === false) {
  console.error("Invalid to-address");
}
// check asset balance
let balance = await bridge.getAccountAsset(assetPair, "mint", fromAccount);
if (balance < amount) {
  console.error("Insufficient balance");
}
// check storeman group quota
let quota = await bridge.getQuota(assetPair, "mint");
if (amount < quota.minQuota || amount > quota.maxQuota) {
  console.error("Invalid amount");
}
```    