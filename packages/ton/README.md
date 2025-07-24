wanchain-cross-sdk ton extension
========

extension of wanchain-cross-sdk for cross-chain between ton and other chains.

## Installation
Use NPM or Yarn to install the package:
```bash
npm install --save @wandevs/cross-ton
```
## Prerequisites
<li>Install Tonkeeper wallet from Chrome Web Store:

[Tonkeeper](https://chromewebstore.google.com/detail/omaabbefbmiijedngplfjmnooppbclkk)

## Usage
Step 1: Import WanBridge and ton extension, create a bridge instance and initialize it with the extension.

```javascript
import { WanBridge } from '@wandevs/cross-core'
import TonExtension from '@wandevs/cross-ton'

let bridge = new WanBridge("testnet");
// TODO: add code to process bridge events

let iwanAuth = {
  apiKey: "your-api-key",
  secretKey: "your-secret-key"
};

bridge.init(iwanAuth, {extensions: [TonExtension]});
```

Step 2: Connect the Tonkeeper wallet.

```javascript
let tonWallet = new TonExtension.TonkeeperWallet("testnet");
```

Step 3: Select a related asset pair and create cross-chain task.

```javascript
let task = await bridge.createTask("USDC", 'Ton', "Ethereum", 10, "ton-address", "ethereum-address", {wallet: tonWallet});
```