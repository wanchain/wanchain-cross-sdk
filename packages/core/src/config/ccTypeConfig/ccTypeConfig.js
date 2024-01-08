
'use strict';

module.exports = [
    {
      "name": "MintCoin",
      "handle": require("./MintCoinHandle.js")
    },
    {
      "name": "MintErc20",
      "handle": require("./MintErc20Handle")
    },
    {
      "name": "BurnErc20",
      "handle": require("./BurnErc20Handle")
    },
    {
      "name": "MintBtcFromBitcoinHandle",
      "handle": require("./MintBtcFromBitcoinHandle")
    },
    {
      "name": "MintXrpFromRippleHandle",
      "handle": require("./MintXrpFromRippleHandle")
    },
    {
      "name": "MintDotFromPolkaHandle",
      "handle": require("./MintDotFromPolkaHandle")
    },
    {
      "name": "BurnErc20ProxyToken",
      "handle": require("./BurnErc20ProxyToken")
    },
    {
      "name": "MintAdaFromCardano",
      "handle": require("./MintAdaFromCardano")
    },
    {
      "name": "BurnFromCardano",
      "handle": require("./BurnFromCardano")
    },
    {
      "name": "CircleBridgeDeposit",
      "handle": require("./CircleBridgeDeposit")
    },
    {
      "name": "MintFromCosmos",
      "handle": require("./MintFromCosmos")
    },
    {
      "name": "CircleBridgeNobleDeposit",
      "handle": require("./CircleBridgeNobleDeposit")
    }
]