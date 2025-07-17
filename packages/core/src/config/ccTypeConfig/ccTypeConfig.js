
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
      "name": "MintFromCardano",
      "handle": require("./MintFromCardano")
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
    },
    {
      "name": "CircleBridgeSolanaDeposit",
      "handle": require("./CircleBridgeSolanaDeposit")
    },
    {
      "name": "MintFromAlgorand",
      "handle": require("./MintFromAlgorand")
    },
    {
      "name": "MintFromSolana",
      "handle": require("./MintFromSolana")
    },
    {
      "name": "BurnFromSolana",
      "handle": require("./BurnFromSolana")
    },
    {
      "name": "CircleBridgeSuiDeposit",
      "handle": require("./CircleBridgeSuiDeposit")
    },
    {
      "name": "ClaimRewardTask",
      "handle": require("./ClaimRewardTask")
    },
    {
      "name": "MintFromSui",
      "handle": require("./MintFromSui")
    },
    {
      "name": "BurnFromSui",
      "handle": require("./BurnFromSui")
    },
    {
      "name": "MintFromTon",
      "handle": require("./MintFromTon")
    }
]