
'use strict';

let ccTypeConfigJson = {
  "ccTypeCfg": [
    {
      "number": 1,
      "name": "MintCoin",
      "handle": require("./MintCoinHandle.js")
    },
    {
      "number": 2,
      "name": "MintErc20",
      "handle": require("./MintErc20Handle")
    },
    {
      "number": 3,
      "name": "BurnErc20",
      "handle": require("./BurnErc20Handle")
    },
    {
      "number": 4,
      "name": "MintOtherCoinBetweenEthWanHandle",
      "handle": require("./MintOtherCoinBetweenEthWanHandle")
    },
    {
      "number": 7,
      "name": "MintBtcFromBitcoinHandle",
      "handle": require("./MintBtcFromBitcoinHandle")
    },
    {
      "number": 8,
      "name": "MintXrpFromRippleHandle",
      "handle": require("./MintXrpFromRippleHandle")
    },
    {
      "number": 9,
      "name": "MintDotFromPolkaHandle",
      "handle": require("./MintDotFromPolkaHandle")
    },
    {
      "number": 10,
      "name": "BurnErc20ProxyToken",
      "handle": require("./BurnErc20ProxyToken")
    },
    {
      "number": 11,
      "name": "MintAdaFromCardano",
      "handle": require("./MintAdaFromCardano")
    }
  ]
};

module.exports = ccTypeConfigJson;

