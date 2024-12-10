wanchain-cross-sdk sui extension
========

extension of wanchain-cross-sdk for cross-chain between sui and other chains.

## Installation
Use NPM or Yarn to install the package:
```bash
npm install --save @wandevs/cross-sui
```
## Prerequisites
<li>Install Phantom wallet from Chrome Web Store:

[Sui Wallet](https://chromewebstore.google.com/detail/sui-wallet/opcgpfmipidbgpenhmajoajpbobppdil)

## Usage
Step 1: Import WanBridge and sui extension, create a bridge instance and initialize it with the extension.

```javascript
import { WanBridge } from '@wandevs/cross-core'
import SuiExtension from '@wandevs/cross-sui'

let bridge = new WanBridge("testnet");
// TODO: add code to process bridge events

let iwanAuth = {
  apiKey: "your-api-key",
  secretKey: "your-secret-key"
};

bridge.init(iwanAuth, {extensions: [SuiExtension]});
```

Step 2: Connect the Phantom wallet.

```javascript
let suiWallet = new SuiExtension.SuiWallet("testnet");
```

Step 3: Select a related asset pair and create cross-chain task.

```javascript
let task = await bridge.createTask("USDC", 'Sui', "Ethereum", 10, "sui-address", "ethereum-address", {wallet: suiWallet});
```