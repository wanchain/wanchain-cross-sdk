const wanUtil = require('wanchain-util');
const ethUtil = require('ethereumjs-util');
const litecore = require('litecore-lib');
const { bech32 } = require('bech32');
const { PolkadotSS58Format, deriveAddress } = require('@substrate/txwrapper-core');
const WAValidator = require('multicoin-address-validator');

function getCurTimestamp(toSecond = false) {
  let ts = new Date().getTime();
  if (toSecond) {
    ts = parseInt(ts / 1000);
  }
  return ts;
}

function checkTimeout(baseTimestamp, milliSecond) {
  let cur = getCurTimestamp();
  let base = parseInt(baseTimestamp);
  let timeout = parseInt(milliSecond);
  return (cur > (base + timeout));
}

async function sleep(time) {
  return new Promise(function(resolve) {
    setTimeout(() => {
      resolve();
    }, time);
  });
}

function isValidEthAddress(address) {
  let valid = WAValidator.validate(address, 'ETH');
  return valid;
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

function isValidBtcAddress(address, network) {
  if (network !== "testnet") {
    network = "prod";
  }
  let valid = WAValidator.validate(address, 'BTC', network);
  return valid;
}

function isValidLtcAddress(address, network) {
  if (typeof (address) !== 'string') {
    return false;
  }
  try {
    let isMainNet = (network === 'mainnet')? true : false;
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

function isValidDogeAddress(address, network) {
  if (network !== "testnet") {
    network = "prod";
  }
  let valid = WAValidator.validate(address, 'DOGE', network);
  return valid;
}

function isValidXrpAddress(address) {
  let valid = WAValidator.validate(address, 'XRP');
  return valid;
}

function isValidDotAddress(account, network) {  
  try {
    let format = ("testnet" === network)? PolkadotSS58Format.westend : PolkadotSS58Format.polkadot;
    let addr = deriveAddress(account, format);
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
  } else if ((chainType === "MOVR") && (chainName === "Moonbase Alpha")) {
    return "DEV";
  } else {
    return chainType;
  }
}

module.exports = {
  getCurTimestamp,
  checkTimeout,
  sleep,
  isValidEthAddress,
  isValidWanAddress,
  isValidBtcAddress,
  isValidLtcAddress,
  isValidDogeAddress,
  isValidXrpAddress,
  isValidDotAddress,
  getCoinSymbol
}