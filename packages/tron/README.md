wanchain-cross-sdk tron extension
========

extension of wanchain-cross-sdk for cross-chain between tron and other chains.

## Installation
Use NPM or Yarn to install the package:
```bash
npm install --save @wandevs/cross-tron
```
## Prerequisites
<li>Install TronLink wallet from Chrome Web Store:

[TronLink](https://chrome.google.com/webstore/detail/tronlink/ibnejdfjmmkpcnlpebklmnkoeoihofec)

## Usage
Step 1: Import WanBridge and tron extension, create a bridge instance and initialize it with the extension.

```javascript
import { WanBridge } from '@wandevs/cross-core'
import TronExtension from '@wandevs/cross-tron'

let bridge = new WanBridge("testnet");
// TODO: add code to process bridge events

let iwanAuth = {
  apiKey: "your-api-key",
  secretKey: "your-secret-key"
};

bridge.init(iwanAuth, {extensions: [TronExtension]});
```

Step 2: Connect the TronLink wallet.

```javascript
let tronLinkWallet = new TronExtension.TronLinkWallet("testnet");
```

Step 3: Select a related asset pair and create cross-chain task.

```javascript
let task = await bridge.createTask("TRX", 'Tron', "Wanchain", 10, "tron-address", "wanchain-address", {wallet: tronLinkWallet});
```