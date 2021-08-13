
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
      "number": 5,
      "name": "BurnOtherCoinBetweenEthWanHandle",
      "handle": require("./BurnOtherCoinBetweenEthWanHandle")
    },
    {
      "number": 6,
      "name": "BurnOtherCoinToAncestorChain",
      "handle": require("./BurnOtherCoinToAncestorChain")
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
      "name": "BurnFnxErc20",
      "handle": require("./BurnFnxErc20Handle")
    },
    {
      "number": 10,
      "name": "MintWanFnxErc20",
      "handle": require("./MintWanFnxErc20")
    },
    {
      "number": 11,
      "name": "BurnWanFnxErc20",
      "handle": require("./BurnWanFnxErc20")
    },
    {
      "number": 12,
      "name": "MintLtcFromLitecoinHandle",
      "handle": require("./MintLtcFromLitecoinHandle")
    },
    {
      "number": 13,
      "name": "MintDotFromPolkaHandle",
      "handle": require("./MintDotFromPolkaHandle")
    },
    {
      "number": 14,
      "name": "BurnErc20ProxyToken",
      "handle": require("./BurnErc20ProxyToken")
    }
  ]
};

module.exports = ccTypeConfigJson;

