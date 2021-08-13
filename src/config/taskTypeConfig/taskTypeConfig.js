
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
      "name": "ProcessFnxErc20UserFastBurn",
      "handle": require("./processFnxErc20UserFastBurn")
    },
    {
      "number": 11,
      "name": "ProcessWanFnxErc20UserFastMint",
      "handle": require("./processWanFnxErc20UserFastMint")
    },
    {
      "number": 12,
      "name": "ProcessWanFnxErc20UserFastBurn",
      "handle": require("./processWanFnxErc20UserFastBurn")
    },
    {
      "number": 13,
      "name": "ProcessMintLtcFromLitecoin",
      "handle": require("./processMintLtcFromLitecoin")
    },
    {
      "number": 14,
      "name": "ProcessDotMintFromPolka",
      "handle": require("./processDotMintFromPolka")
    },
    {
      "number": 15,
      "name": "ProcessBurnErc20ProxyToken",
      "handle": require("./ProcessBurnErc20ProxyToken")
    }
  ]
};

module.exports = taskTypeConfigJson;

