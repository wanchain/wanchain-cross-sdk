wanchain-cross-sdk bitcoin extension
========

extension of wanchain-cross-sdk for cross-chain between bitcoin and other chains.

## Installation
Use NPM or Yarn to install the package:
```bash
npm install --save @wandevs/cross-bitcoin
```
## Prerequisites
<li>Install your favorite Bitcoin wallet from Chrome Web Store, such as:

[UniSat Wallet](https://chromewebstore.google.com/detail/unisat-wallet/ppbibelpcjmhbdihakflkdcoccbgbkpo),
[OKX Wallet](https://chrome.google.com/webstore/detail/okx-wallet/mcohilncbfahbmgdjkbpemcciiolgcge)

## Usage
Step 1: Import WanBridge and bitcoin extension, create a bridge instance and initialize it with the extension.

```javascript
import { WanBridge } from '@wandevs/cross-core'
import BitcoinExtension from '@wandevs/cross-bitcoin'

let bridge = new WanBridge("testnet");
// TODO: add code to process bridge events

let iwanAuth = {
  apiKey: "your-api-key",
  secretKey: "your-secret-key"
};

bridge.init(iwanAuth, {extensions: [BitcoinExtension]});
```

Step 2: Connect a wallet.

```javascript
let wallet = new BitcoinExtension.UnisatWallet();
// let wallet = new BitcoinExtension.OkxBitcoin();
```

Step 3: Select a related asset pair and create cross-chain task.

```javascript
let task = await bridge.createTask("BTC", 'Bitcoin', "Wanchain", 10, bitcoin-address, wanchain-address, {wallet});
```