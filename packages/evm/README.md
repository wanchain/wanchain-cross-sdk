wanchain-cross-sdk evm extension
========

extension of wanchain-cross-sdk for cross-chain between evm chains and other chains.

## Installation
Use NPM or Yarn to install the package:
```bash
npm install --save @wandevs/cross-evm
```
## Prerequisites
<li>Install your favorite EVM wallet from Chrome Web Store, such as:

[MetaMask](https://chrome.google.com/webstore/detail/metamask/nkbihfbeogaeaoehlefnkodbefgpgknn),
[Rabby Wallet](https://chromewebstore.google.com/detail/rabby-wallet/acmacodkjbdgmoleebolmdjonilkdbch),
[OKX Wallet](https://chrome.google.com/webstore/detail/okx-wallet/mcohilncbfahbmgdjkbpemcciiolgcge)

## Usage
Step 1: Import WanBridge and evm extension, create a bridge instance and initialize it with the extension.

```javascript
import { WanBridge } from '@wandevs/cross-core'
import EvmExtension from '@wandevs/cross-evm'

let bridge = new WanBridge("testnet");
// TODO: add code to process bridge events

let iwanAuth = {
  apiKey: "your-api-key",
  secretKey: "your-secret-key"
};

bridge.init(iwanAuth, {extensions: [EvmExtension]});
```

Step 2: Connect a wallet.

```javascript
let wallet = new EvmExtension.MetamaskWallet();
// let wallet = new EvmExtension.RabbyWallet();
// let wallet = new EvmExtension.OkxWallet();
```

Step 3: Select a related asset pair and create cross-chain task.

```javascript
let task = await bridge.createTask("ETH", 'Ethereum', "Wanchain", 10, ethereum-address, wanchain-address, {wallet});
```