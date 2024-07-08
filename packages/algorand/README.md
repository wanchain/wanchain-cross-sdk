wanchain-cross-sdk algorand extension
========

extension of wanchain-cross-sdk for cross-chain between algorand and other chains.

## Installation
Use NPM or Yarn to install the package:
```bash
npm install --save @wandevs/cross-algorand
```
## Prerequisites
<li>Install Pera wallet app:

[Pera](https://perawallet.app)

## Usage
Step 1: Import WanBridge and algorand extension, create a bridge instance and initialize it with the extension.

```javascript
import { WanBridge } from '@wandevs/cross-core'
import AlgorandExtension from '@wandevs/cross-algorand'

let bridge = new WanBridge("testnet");
// TODO: add code to process bridge events

let iwanAuth = {
  apiKey: "your-api-key",
  secretKey: "your-secret-key"
};

bridge.init(iwanAuth, {extensions: [AlgorandExtension]});
```

Step 2: Connect the Pera wallet.

```javascript
let algorandWallet = new AlgorandExtension.PeraWallet("testnet");
```

Step 3: Select a related asset pair and create cross-chain task.

```javascript
let task = await bridge.createTask("ALGO", 'Algorand', "Ethereum", 10, "algorand-address", "ethereum-address", {wallet: algorandWallet});
```