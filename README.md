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
<li>If you need to send transactions from Wanchain, Ethereum or BSC, only MetaMask is supported, you should install the MetaMask plugin for your browser.
<br><br>

## Usage

Step 1: Import WanBridge, create a bridge object and subscribe to events.

```javascript
import { WanBridge } from 'wanchain-cross-sdk'

let bridge = new WanBridge("testnet"); // testnet or mainnet
bridge.on("ready", assetPairs => {
  // Asset pairs have been obtained from server, and the bridge is ready for crosschain
}).on("error", info => {
  // The bridge initialization failed, or cross-chain task failed
}).on("account", info => {
  // The wallet account is changed
}).on("ota", info => {
  // The one-time-addess to receive Bitcoin, Litecoin or XRP
}).on("lock", info => {
  // The lock transaction hash
}).on("redeem", info => {
  // The redeem transaction hash
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

Step 3: Connect to MetaMask. (Optional)
<br>
If you are sending transactions on Wanchain, Ethereum or BSC, you must connect to MetaMask.
```javascript
bridge.connectMetaMask();
```

Step 4: Choose a asset pair and create mint or burn cross chain task.

```javascript
let assetPair = assetPairs[0];
let task = await bridge.createTask(assetPair, 'mint', 0.1, 'your-receiver-address-on-destination-chain');
await task.init(); // Check wallet, and fetch fee from server
console.log("crosschain operateFee: %s, networkFee: %s", assetPair.fromChainType, task.operateFee, task.networkFee);
// If the user accepts the fee, start the task, otherwise just return
task.start();
```