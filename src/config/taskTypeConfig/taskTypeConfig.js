
'use strict';

let taskTypeConfigJson = {
  "taskTypeCfg": [
    {
      "number": 1,
      "name": "ProcessErc20UserFastMint",
      "handle": require("./processErc20UserFastMint.js")
    },
    {
      "number": 2,
      "name": "ProcessErc20Approve",
      "handle": require("./processErc20Approve")
    },
    {
      "number": 3,
      "name": "ProcessErc20UserFastBurn",
      "handle": require("./processErc20UserFastBurn")
    },
    {
      "number": 4,
      "name": "ProcessCoinUserFastMint",
      "handle": require("./processCoinUserFastMint")
    },
    {
      "number": 5,
      "name": "ProcessBurnOtherCoinToAncestorChain",
      "handle": require("./processBurnOtherCoinToAncestorChain")
    },
    {
      "number": 6,
      "name": "ProcessMintOtherCoinBetweenEthWan",
      "handle": require("./processMintOtherCoinBetweenEthWan")
    },
    {
      "number": 7,
      "name": "ProcessMintBtcFromBitcoin",
      "handle": require("./processMintBtcFromBitcoin")
    },
    {
      "number": 8,
      "name": "ProcessXrpMintFromRipple",
      "handle": require("./processXrpMintFromRipple")
    },
    {
      "number": 9,
      "name": "ProcessBurnOtherCoinBetweenEthWan",
      "handle": require("./processBurnOtherCoinBetweenEthWan")
    },
    {
      "number": 10,
      "name": "ProcessDotMintFromPolka",
      "handle": require("./processDotMintFromPolka")
    },
    {
      "number": 11,
      "name": "ProcessBurnErc20ProxyToken",
      "handle": require("./ProcessBurnErc20ProxyToken")
    }
  ]
};

module.exports = taskTypeConfigJson;