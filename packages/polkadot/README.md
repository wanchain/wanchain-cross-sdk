wanchain-cross-sdk polkadot extension
========

extension of wanchain-cross-sdk for cross-chain between polkadot and other chains.

## Installation
Use NPM or Yarn to install the package:
```bash
npm install --save @wandevs/cross-polkadot
```
## Prerequisites
<li>Install polkadot{.js} wallet from Chrome Web Store:

[polkadot{.js}](https://chrome.google.com/webstore/detail/polkadot%7Bjs%7D-extension/mopnmbcafieddcagagdcbnhejhlodfdd)

## Usage
Step 1: Import WanBridge and polkadot extension, create a bridge instance and initialize it with the extension.

```javascript
import { WanBridge } from '@wandevs/cross-core'
import PolkadotExtension from '@wandevs/cross-polkadot'

let bridge = new WanBridge("testnet");
// TODO: add code to process bridge events

let iwanAuth = {
  apiKey: "your-api-key",
  secretKey: "your-secret-key"
};

bridge.init(iwanAuth, {extensions: [PolkadotExtension]});
```

Step 2: Connect the polkadot{.js} wallet.

```javascript
let polkadotJsWallet = new PolkadotExtension.PolkadotJsWallet("testnet");
```

Step 4: Select a related asset pair and create cross-chain task.

```javascript
// NOTE that testnt asset symbol is WND, and mainnet is DOT
let task = await bridge.createTask("WND", 'Polkadot', "Wanchain", 10, "polkadot-address", "wanchain-address", {wallet: polkadotJsWallet});
```