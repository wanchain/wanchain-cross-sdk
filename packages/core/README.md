wanchain-cross-sdk core
========

core of wanchain-cross-sdk for cross-chain based on WanBridge.

## Installation
Use NPM or Yarn to install the package:
```bash
npm install --save @wandevs/cross-core
```
## Prerequisites
<li>wanchain-cross-sdk relies on iWan service, accessed through API key, you can apply from iWan website.

[iWan](https://iwan.wanchain.org)

<li>Install your favorite Web3 wallet from Chrome Web Store, such as:

[MetaMask](https://chrome.google.com/webstore/detail/metamask/nkbihfbeogaeaoehlefnkodbefgpgknn),
[WanMask](https://github.com/wanchain/wanmask),
[XDCPay](https://chrome.google.com/webstore/detail/xdcpay/bocpokimicclpaiekenaeelehdjllofo),
[OKX Wallet](https://chrome.google.com/webstore/detail/okx-wallet/mcohilncbfahbmgdjkbpemcciiolgcge),
[CLV Wallet](https://chrome.google.com/webstore/detail/clv-wallet/nhnkbkgjikgcigadomkphalanndcapjk),

SDK core has built-in Web3Wallet support for cross-chain between EVM chains. Some extensions are provided to support sending transactions on other chains, such as Cardano, Polkadot and Tron, please refer the corresponding guide.

<li>If you need to cross-chain from Bitcoin, Litecoin or XRP Ledger, you should install related wallets. 

SDK does not automatically initiate transaction on these chains, you need do it manually.

## Usage
Step 1: Import WanBridge and Web3Wallet, create a bridge instance and subscribe to events.

```javascript
import { WanBridge, Web3Wallet } from '@wandevs/cross-core'

let bridge = new WanBridge("testnet"); // testnet or mainnet
bridge.on("ready", assetPairs => {
  /* the bridge is initialized successfully and is ready for cross-chain, you can filter assetPairs by asset type and chain name as needed.
    assetPairs example: [
      {
        assetPairId: "1",
        assetType: "ETH",
        protocol: "Erc20",
        ancestorChainName: "Ethereum",
        fromSymbol: "ETH",
        toSymbol: "wanETH",
        fromDecimals: "18",
        toDecimals: "18",
        fromChainName: "Ethereum",
        toChainName: "Wanchain",
        fromAccount: "0x0000000000000000000000000000000000000000",
        toAccount: "0x48344649b9611a891987b2db33faada3ac1d05ec",
        fromIsNative: true,
        toIsNative: false,
        fromIssuer: pair.fromIssuer,
        toIssuer: pair.toIssuer
      },
      ......
    ]
  */
}).on("error", info => {
  /* failed to initialize the bridge, or cross-chain task failed.
    error info structure: {
      taskId, // optional, only task error info has taskId field
      reason
    }
    a task error info may includes the following reason:
    "Invalid wallet"
    "Failed to send transaction"
    "Rejected"
    "Insufficient balance"
    "Failed to approve token"
    "Failed to generate ota address"
    "Transaction failed"
    "Amount is too small to pay the bridge fee"
    "Waiting for locking asset timeout"
    "Please contact the Wanchain Foundation (techsupport@wanchain.org)"
  */
}).on("ota", info => {
  /* the one-time-addess is generated to receive BTC, LTC, DOGE or XRP.
    ota info structure: {
      taskId,
      address:, // BTC/LTC/DOGE ota address, or XRP xAddress
      rAddress, // optional, XRP rAddress
      tagId     // optional, XRP tag ID
    }
  */
}).on("lock", info => {
  /* the lock transaction hash
    lock info structure: {
      taskId,
      txHash
    }
  */
}).on("redeem", info => {
  /* the redeem transaction hash, indicates that the cross-chain task is finished.
    redeem info structure: {
      taskId,
      txHash
    }
  */
});
```
Step 2: Initialize the bridge with your iwan API key and other options.

```javascript
let iwanAuth = {
  apiKey: "your-api-key",
  secretKey: "your-secret-key"
};

// options is not necessary if none of customization requirements
let options = {
  extensions: [],     // register extensions when cross-chain from Cardano, Polkadot and Tron
  crossAssets: [],    // filter asset pairs by asset types
  crossChains: [],    // filter asset pairs by chains
  crossProtocols: [], // filter asset pairs by protocols: Erc20, Erc721, Erc1155
};

bridge.init(iwanAuth, options);
```

Step 3: Connect a wallet.

```javascript
// no need to create wallet when cross-chain from Bitcoin, Litecoin, Doge or XRP Ledger, user should send transaction manually
let web3Wallet = new Web3Wallet(window.ethereum);
```

Step 4: Select a asset pair and create cross-chain task (take Erc20 for example).

```javascript
try {
  let assetType = "USDT";
  let fromChainName = "Ethereum";
  let toChainName = "Wanchain";

  // check wallet network
  let checkWallet = await bridge.checkWallet(fromChainName, web3Wallet);
  if (checkWallet === false) {
    throw "Invalid wallet or network";
  }

  // get wallet current selected account
  let fromAccount = web3Wallet.getAccounts("testnet")[0];

  // input cross-chain receipient
  let toAccount = 'recipient-address';

  // input cross-chain amount, the format of different token types is as follows
  // Erc20: number
  // Erc721: [{tokenId: number, name: string}]
  // Erc1155: [{tokenId: number, name: string, amount: number}]

  // take Erc20 token as an example
  let amount = 10;

  // check to-address format
  let validTo = bridge.validateToAccount(fromChainName, toAccount);
  if (validTo === false) {
    throw "Invalid to-address";
  }

  // check asset balance
  let balance = await bridge.getAccountBalance(assetType, fromChainName, fromAccount);
  if (amount > balance) {
    throw "Insufficient balance";
  }

  /* the bridge fee includes networkFee (unit is the frome chain coin symbol) and operateFee (unit is the assetType):
    {
      networkFee: {value, unit, isRatio, min, max, decimals},
      operateFee: {value, unit, isRatio, min, max, decimals}
    }
    if isRatio is false, "value" is the fixed fee, otherwise "value" is the fee ratio, and the total fee is between "min" and "max".
    function parseFee() is a reference implementation to calculate fee.
  */
  let fee = await bridge.estimateFee(assetType, fromChainName, toChainName);
  let networkFee = parseFee(fee, amount, fee.networkFee.unit, {feeType: "networkFee"});

  // use agent amount to check min crosschain value and max quota, which include agentFee, exclude networkFee
  let netAmount = amount - networkFee;
  let quota = await bridge.getQuota(assetType, fromChainName, toChainName);
  if (netAmount < quota.minQuota) {
    throw "Amount is too small";
  } else if (netAmount > quota.maxQuota) {
    throw "Exceed maxQuota";
  }

  // create a cross-chain task
  let task = await bridge.createTask(assetType, fromChainName, toChainName, amount, fromAccount, toAccount, {wallet: web3Wallet});
} catch(err) {
  console.error(err);
  /* createTask will check the task context and may throw the following error:
    "Invalid fromAccount"
    "Missing fromAccount"
    "Invalid toAccount"
    "Missing wallet"
    "Invalid wallet"
    "Amount is too small to pay the bridge fee"
    "Storeman unavailable"
    "Amount is too small"
    "Exceed maxQuota"
    "Amount is too small to activate storeman account"
    "Insufficient balance"
    "Amount is too small to activate recipient account"
    "Insufficient gas"
    "Insufficient asset"
    "Not owner"
    "Unknown error"
  */
}

function parseFee(fee, amount, unit, options) {
  let result = networkFee = new BigNumber(0), decimals = 0, tmp;
  if (fee.networkFee.unit === unit) {
    tmp = new BigNumber(fee.networkFee.value);
    if (tmp.gt(0) && fee.networkFee.isRatio) {
      tmp = tmp.times(amount);
      if ((fee.networkFee.min != 0) && (tmp.lt(fee.networkFee.min))) {
        tmp = fee.networkFee.min;
      } else if ((fee.networkFee.max != 0) && (tmp.gt(fee.networkFee.max))) {
        tmp = fee.networkFee.max;
      }
    }
    networkFee = tmp;
    if ((!options.feeType) || (options.feeType === "networkFee")) {
      result = result.plus(networkFee);
    }
    decimals = fee.networkFee.decimals;
  }
  if ((fee.operateFee.unit === unit) && ((!options.feeType) || (options.feeType === "operateFee"))) {
    tmp = new BigNumber(fee.operateFee.value);
    if (tmp.gt(0) && fee.operateFee.isRatio) {
      tmp = tmp.times(new BigNumber(amount).minus(networkFee));
      if ((fee.operateFee.min != 0) && (tmp.lt(fee.operateFee.min))) {
        tmp = fee.operateFee.min;
      } else if ((fee.operateFee.max != 0) && (tmp.gt(fee.operateFee.max))) {
        tmp = fee.operateFee.max;
      }
    }
    result = result.plus(tmp);
    decimals = fee.operateFee.decimals;
  }
  return new BigNumber(result.toFixed(decimals)).toFixed();
}
```
The tasks will be automatically scheduled, once it is successfully completed, the "redeem" event will be emitted, if it fails, the "error" event will be emitted.

You can call bridge.cancelTask(task.id) at an appropriate time to cancel the task, it only changes the task status, but does not stop the task.

A cross-chain task can be in the following statuses:
<li>Performing: Start running task
<li>Converting: Lock transaction has been sent
<li>Succeeded:  Redeem transaction has been sent and the task has been successfully completed
<li>Failed:     Failed to finish the task
<li>Error:      The task is completed but incorrect, the asset is not transferred to the account specified by the user
<li>Rejected:   Task is cancelled
<li>Timeout:    Waiting for locking asset more than 24 hours

Do not close or refresh the web page before receiving the "lock" event, otherwise the task will stop and cannot be resumed.

Step 5: Get transaction records.

You can call bridge.getHistory(taskId) at any time to get the transaction records of all tasks or one task, and the records are saved in the browser's local storage.