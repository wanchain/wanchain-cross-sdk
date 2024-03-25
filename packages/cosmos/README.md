wanchain-cross-sdk cosmos extension
========

extension of wanchain-cross-sdk for cross-chain between cosmos and other chains.

## Installation
Use NPM or Yarn to install the package:
```bash
npm install --save @wandevs/cross-cosmos
```
## Prerequisites
<li>Install Keplr wallet from Chrome Web Store:

[Keplr](https://chromewebstore.google.com/detail/keplr/dmkamcknogkgcdfhhbddcghachkejeap)

## Usage
Step 1: Import WanBridge and cosmos extension, create a bridge instance and initialize it with the extension.

```javascript
import { WanBridge } from '@wandevs/cross-core'
import CosmosExtension from '@wandevs/cross-cosmos'

let bridge = new WanBridge("testnet");
// TODO: add code to process bridge events

let iwanAuth = {
  apiKey: "your-api-key",
  secretKey: "your-secret-key"
};

bridge.init(iwanAuth, {extensions: [CosmosExtension]});
```

Step 2: Connect the Keplr wallet.

```javascript
let cosmosWallet = new CosmosExtension.KeplrWallet("testnet");
```

Step 3: Select a related asset pair and create cross-chain task.

```javascript
let task = await bridge.createTask("ATOM", 'Cosmos', "Wanchain", 10, "cosmos-address", "wanchain-address", {wallet: cosmosWallet});
```