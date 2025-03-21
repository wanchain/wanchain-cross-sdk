wanchain-cross-sdk VeChain extension
========

extension of wanchain-cross-sdk for cross-chain between VeChain and other chains.

## Installation
Use NPM or Yarn to install the package:
```bash
npm install --save @wandevs/cross-vechain
```
## Prerequisites
<li>Install VeWorld wallet from Chrome Web Store:

[VeWorld](https://chromewebstore.google.com/detail/veworld/ffondjhiilhjpmfakjbejdgbemolaaho)

## Usage
Step 1: Import WanBridge and VeChain extension, create a bridge instance and initialize it with the extension.

```javascript
import { WanBridge } from '@wandevs/cross-core'
import VeChainExtension from '@wandevs/cross-vechain'

let bridge = new WanBridge("testnet");
// TODO: add code to process bridge events

let iwanAuth = {
  apiKey: "your-api-key",
  secretKey: "your-secret-key"
};

bridge.init(iwanAuth, {extensions: [VeChainExtension]});
```

Step 2: Connect the Phantom wallet.

```javascript
let veWorldWallet = new VeChainExtension.VeWorldWallet("testnet");
```

Step 3: Select a related asset pair and create cross-chain task.

```javascript
let task = await bridge.createTask("VET", 'VeChain', "Ethereum", 10, "vechain-address", "ethereum-address", {wallet: veWorldWallet});
```