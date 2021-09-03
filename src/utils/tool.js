const wanUtil = require('wanchain-util');
const ethUtil = require('ethereumjs-util');
const btcValidate = require('bitcoin-address-validation').default;
const xrpAddrCodec = require('ripple-address-codec');
const litecore = require('litecore-lib');
const dotTxWrapper = require('@substrate/txwrapper');

function getCurTimeSec() {
  return parseInt(new Date().getTime() / 1000);
}

async function sleep(time) {
  return new Promise(function(resolve) {
    setTimeout(() => {
      resolve();
    }, time);
  });
}

function isValidEthAddress(address) {
  try {
    let isValid;
    if (/^0x[0-9a-f]{40}$/.test(address)) {
      isValid = true;
    } else if (/^0x[0-9A-F]{40}$/.test(address)) {
      isValid = true;
    } else {
      isValid = ethUtil.isValidChecksumAddress(address);
    }
    return isValid;
  } catch(err) {
    console.log("validate ETH address %s err: %O", address, err);
    return false;
  }
}

function isValidWanAddress(address) {
  try {
    let validate;
    if (/^0x[0-9a-f]{40}$/.test(address)) {
      validate = true;
    } else if (/^0x[0-9A-F]{40}$/.test(address)) {
      validate = true;
    } else {
      validate = wanUtil.isValidChecksumAddress(address);
      if (true != validate) {
        validate = ethUtil.isValidChecksumAddress(address);
      }
    }
    return validate;
  } catch(err) {
    console.log("validate WAN address %s err: %O", address, err);
    return false;
  }
}

function isValidXrpAddress(accountAddr) {
  let isValid = xrpAddrCodec.isValidXAddress(accountAddr);
  if (true != isValid) {
    isValid = xrpAddrCodec.isValidClassicAddress(accountAddr);
  }
  return isValid;
}

function isValidBtcAddress(address, network) {
  try {
    return btcValidate(address, network);
  } catch(err) {
    console.log("validate BTC address %s err: %O", address, err);
    return false;
  }
}

function isValidLtcAddress(address, network) {
  if (typeof (address) != 'string') {
    return false;
  }
  try {
    let isMainNet = (network == 'mainnet')? true : false;
    if (litecore.Address.isValid(address, isMainNet? 'livenet' : 'testnet')) {
      return true;
    }
    if ((isMainNet && address.startsWith('ltc1')) || (!isMainNet && address.startsWith('tltc1'))) {
      try {
        bech32.decode(address);
        return true;
      } catch (err) {
        return false;
      }
    }
  } catch (err) {
    return false;
  }
  return false;
}

function isValidDotAddress(account, network) {  
  try {
    let format = ("testnet" === network)? dotTxWrapper.WESTEND_SS58_FORMAT : dotTxWrapper.POLKADOT_SS58_FORMAT;
    let addr = dotTxWrapper.deriveAddress(account, format);
    console.log("DOT %s account %s formatted to %s", network, account, addr);
    return (account === addr);
  } catch(err) {
    console.log("DOT %s account %s is invalid: %s", network, account, err);
    return false;
  }
}

function getCoinSymbol(chainType, chainName) {
  if ((chainType === "DOT") && (chainName === "PolkaTestnet")) {
    return "WND";
  } else if ((chainType === "MOVR") && (chainName === "Moonbeam")) {
    return "DEV";
  } else {
    return chainType;
  }
}

module.exports = {
  getCurTimeSec,
  sleep,
  isValidEthAddress,
  isValidWanAddress,
  isValidXrpAddress,
  isValidBtcAddress,
  isValidLtcAddress,
  isValidDotAddress,
  getCoinSymbol
}