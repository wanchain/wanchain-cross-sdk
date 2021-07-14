const wanUtil = require('wanchain-util');
const ethUtil = require('ethereumjs-util');
const btcValidate = require('bitcoin-address-validation');
const xrpAddrCodec = require('ripple-address-codec');
const litecore = require('litecore-lib');
const dotTxWrapper = require('@substrate/txwrapper');

function hexCharCodeToStr(hexCharCodeStr) {
  if (!hexCharCodeStr) {
    return '';
  }
  let trimedStr = hexCharCodeStr.trim();
  let rawStr = trimedStr.substr(0, 2).toLowerCase() === '0x' ? trimedStr.substr(2) : trimedStr;
  let len = rawStr.length;
  if (len % 2 !== 0) {
    return '';
  }
  let resultStr = [];
  for (var i = 0; i < len; i = i + 2) {
    let tmpStr = rawStr.substr(i, 2);
    if (tmpStr !== '00') {
      resultStr.push(String.fromCharCode(parseInt(tmpStr, 16)));
    }
  }
  return resultStr.join('');
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

function isValidDotAddress(account, network){
  let formattedAddr = '';
  try {
    if (network == 'mainnet') {
      formattedAddr = dotTxWrapper.deriveAddress(account, dotTxWrapper.POLKADOT_SS58_FORMAT);
      console.log("POLKADOT_SS58_FORMAT account: %s", formattedAddr);
    } else {
      formattedAddr = dotTxWrapper.deriveAddress(account, dotTxWrapper.WESTEND_SS58_FORMAT);
      console.log("WESTEND_SS58_FORMAT account: %s", formattedAddr);
    }
    return true;
  } catch(err) {
    console.log("validate DOT account %s err: %O", account, err);
    return false;
  }
}

module.exports = {
  hexCharCodeToStr,
  sleep,
  isValidEthAddress,
  isValidWanAddress,
  isValidXrpAddress,
  isValidBtcAddress,
  isValidLtcAddress,
  isValidDotAddress
}