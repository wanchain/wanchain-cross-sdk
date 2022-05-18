
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
      "number": 10,
      "name": "ProcessDotMintFromPolka",
      "handle": require("./processDotMintFromPolka")
    },
    {
      "number": 11,
      "name": "ProcessBurnErc20ProxyToken",
      "handle": require("./ProcessBurnErc20ProxyToken")
    },
    {
      "number": 12,
      "name": "ProcessErc721Approve",
      "handle": require("./processErc721Approve")
    },
    {
      "number": 13,
      "name": "ProcessAdaMintFromCardano",
      "handle": require("./processAdaMintFromCardano")
    }
  ]
};

module.exports = taskTypeConfigJson;