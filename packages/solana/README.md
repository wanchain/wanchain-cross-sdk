wanchain-cross-sdk solana extension
========

extension of wanchain-cross-sdk for cross-chain between solana and other chains.

## Installation
Use NPM or Yarn to install the package:
```bash
npm install --save @wandevs/cross-solana
```
## Prerequisites
<li>Install Phantom wallet from Chrome Web Store:

[Phantom](https://chromewebstore.google.com/detail/phantom/bfnaelmomeimhlpmgjnjophhpkkoljpa)

## Usage
Step 1: Import WanBridge and solana extension, create a bridge instance and initialize it with the extension.

```javascript
import { WanBridge } from '@wandevs/cross-core'
import SolanaExtension from '@wandevs/cross-solana'

let bridge = new WanBridge("testnet");
// TODO: add code to process bridge events

let iwanAuth = {
  apiKey: "your-api-key",
  secretKey: "your-secret-key"
};

bridge.init(iwanAuth, {extensions: [SolanaExtension]});
```

Step 2: Connect the Phantom wallet.

```javascript
let solanaWallet = new SolanaExtension.SolanaWallet("testnet");
```

Step 3: Select a related asset pair and create cross-chain task.

```javascript
let task = await bridge.createTask("USDC", 'Solana', "Ethereum", 10, "solana-address", "ethereum-address", {wallet: solanaWallet});
```