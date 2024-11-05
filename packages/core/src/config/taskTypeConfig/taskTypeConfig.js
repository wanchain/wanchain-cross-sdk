
'use strict';

module.exports = [
    {
      "name": "ProcessErc20UserFastMint",
      "handle": require("./ProcessErc20UserFastMint.js")
    },
    {
      "name": "ProcessErc20Approve",
      "handle": require("./ProcessErc20Approve")
    },
    {
      "name": "ProcessErc20UserFastBurn",
      "handle": require("./ProcessErc20UserFastBurn")
    },
    {
      "name": "ProcessCoinUserFastMint",
      "handle": require("./ProcessCoinUserFastMint")
    },
    {
      "name": "ProcessMintBtcFromBitcoin",
      "handle": require("./ProcessMintBtcFromBitcoin")
    },
    {
      "name": "ProcessXrpMintFromRipple",
      "handle": require("./ProcessXrpMintFromRipple")
    },
    {
      "name": "ProcessDotMintFromPolka",
      "handle": require("./ProcessDotMintFromPolka")
    },
    {
      "name": "ProcessBurnErc20ProxyToken",
      "handle": require("./ProcessBurnErc20ProxyToken")
    },
    {
      "name": "ProcessErc721Approve",
      "handle": require("./ProcessErc721Approve")
    },
    {
      "name": "ProcessAdaMintFromCardano",
      "handle": require("./ProcessAdaMintFromCardano")
    },
    {
      "name": "ProcessBurnFromCardano",
      "handle": require("./ProcessBurnFromCardano")
    },
    {
      "name": "ProcessPhaMintFromPhala",
      "handle": require("./ProcessPhaMintFromPhala")
    },
    {
      "name": "ProcessCircleBridgeDeposit",
      "handle": require("./ProcessCircleBridgeDeposit")
    },
    {
      "name": "ProcessMintFromCosmos",
      "handle": require("./ProcessMintFromCosmos")
    },
    {
      "name": "ProcessCircleBridgeNobleDeposit",
      "handle": require("./ProcessCircleBridgeNobleDeposit")
    },
    {
      "name": "ProcessCircleBridgeSolanaDeposit",
      "handle": require("./ProcessCircleBridgeSolanaDeposit")
    },
    {
      "name": "ProcessCircleBridgeSolanaReclaim",
      "handle": require("./ProcessCircleBridgeSolanaReclaim")
    },
    {
      "name": "ProcessMintFromAlgorand",
      "handle": require("./ProcessMintFromAlgorand")
    },
    {
      "name": "ProcessMintFromSolana",
      "handle": require("./ProcessMintFromSolana")
    },
    {
      "name": "ProcessBurnFromSolana",
      "handle": require("./ProcessBurnFromSolana")
    }
]