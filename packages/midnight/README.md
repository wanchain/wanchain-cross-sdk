wanchain-cross-sdk midnight extension
========

extension of wanchain-cross-sdk for cross-chain between midnight and other chains.

## Installation
Use NPM or Yarn to install the package:
```bash
npm install --save @wandevs/cross-midnight
```
## Prerequisites
<li>Install your favorite Midnight wallet from Chrome Web Store, such as:

[Midnight Lace](https://chrome.google.com/webstore/detail/nami/lpfcbjknijpeeillifnkikgncikgfhdo)

## Usage
Step 1: Import WanBridge and midnight extension, create a bridge instance and initialize it with the extension.

```javascript
import { WanBridge } from '@wandevs/cross-core'
import MidnightExtension from '@wandevs/cross-midnight'

let bridge = new WanBridge("testnet");
// TODO: add code to process bridge events

let iwanAuth = {
  apiKey: "your-api-key",
  secretKey: "your-secret-key"
};

bridge.init(iwanAuth, {extensions: [MidnightExtension]});
```

Step 2: Connect a wallet.

```javascript
let wallet = new MidnightExtension.LaceMidnightWallet();
```

Step 3: Select a related asset pair and create cross-chain task.

```javascript
let task = await bridge.createTask("DUST", 'Midnight', "Wanchain", 10, midnight-address, wanchain-address, {wallet});
```