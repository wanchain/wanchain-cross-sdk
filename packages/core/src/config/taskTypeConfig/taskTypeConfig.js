
'use strict';

module.exports = [
    {
      "name": "ProcessErc20UserFastMint",
      "handle": require("./processErc20UserFastMint.js")
    },
    {
      "name": "ProcessErc20Approve",
      "handle": require("./processErc20Approve")
    },
    {
      "name": "ProcessErc20UserFastBurn",
      "handle": require("./processErc20UserFastBurn")
    },
    {
      "name": "ProcessCoinUserFastMint",
      "handle": require("./processCoinUserFastMint")
    },
    {
      "name": "ProcessMintBtcFromBitcoin",
      "handle": require("./processMintBtcFromBitcoin")
    },
    {
      "name": "ProcessXrpMintFromRipple",
      "handle": require("./processXrpMintFromRipple")
    },
    {
      "name": "ProcessDotMintFromPolka",
      "handle": require("./processDotMintFromPolka")
    },
    {
      "name": "ProcessBurnErc20ProxyToken",
      "handle": require("./ProcessBurnErc20ProxyToken")
    },
    {
      "name": "ProcessErc721Approve",
      "handle": require("./processErc721Approve")
    },
    {
      "name": "ProcessAdaMintFromCardano",
      "handle": require("./processAdaMintFromCardano")
    },
    {
      "name": "ProcessBurnFromCardano",
      "handle": require("./processBurnFromCardano")
    },
    {
      "name": "ProcessPhaMintFromPhala",
      "handle": require("./processPhaMintFromPhala")
    },
    {
      "name": "ProcessCircleBridgeDeposit",
      "handle": require("./processCircleBridgeDeposit")
    },
    {
      "name": "ProcessMintFromCosmos",
      "handle": require("./processMintFromCosmos")
    },
    {
      "name": "ProcessCircleBridgeNobleDeposit",
      "handle": require("./ProcessCircleBridgeNobleDeposit")
    },
]