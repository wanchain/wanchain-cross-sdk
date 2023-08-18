wanchain-cross-sdk cardano extension
========

extension of wanchain-cross-sdk for cross-chain between cardano and other chains.

## Installation
Use NPM or Yarn to install the package:
```bash
npm install --save @wandevs/cross-cardano
```
## Prerequisites
<li>Install your favorite Cardano wallet from Chrome Web Store, such as:

[Nami](https://chrome.google.com/webstore/detail/nami/lpfcbjknijpeeillifnkikgncikgfhdo),
[Yoroi](https://chrome.google.com/webstore/detail/yoroi/ffnbelfdoeiohenkjibnmadjiehjhajb),
[Eternl](https://chrome.google.com/webstore/detail/eternl/kmhcihpebfmpgmihbkipmjlmmioameka)

## Usage
Step 1: Import WanBridge and cardano extension, create a bridge instance and initialize it with the extension.

```javascript
import { WanBridge } from '@wandevs/cross-core'
import CardanoExtension from '@wandevs/cross-cardano'

let bridge = new WanBridge("testnet");
// TODO: add code to process bridge events

let iwanAuth = {
  apiKey: "your-api-key",
  secretKey: "your-secret-key"
};

bridge.init(iwanAuth, {extensions: [CardanoExtension]});
```

Step 2: Connect a wallet.

```javascript
let namiWallet = new CardanoExtension.NamiWallet("testnet");
// let yoroiWallet = new CardanoExtension.YoroiWallet("testnet");
// let eternlWallet = new CardanoExtension.EternlWallet("testnet");
```

Step 3: Select a related asset pair and create cross-chain task.

```javascript
let task = await bridge.createTask("ADA", 'Cardano', "Wanchain", 10, "cardano-address", "wanchain-address", {wallet: namiWallet});
```