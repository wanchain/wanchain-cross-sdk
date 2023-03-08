const wanUtil = require('wanchain-util');
const ethUtil = require('ethereumjs-util');
const WAValidator = require('multicoin-address-validator');
const BigNumber = require('bignumber.js');
const crypto = require('crypto');
const Web3 = require('web3');

const web3 = new Web3();

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

function hexStrip0x(hexStr) {
  if (0 == hexStr.indexOf('0x')) {
      return hexStr.slice(2);
  }
  return hexStr;
}

function bytes2Hex(bytes) {
  return Array.from(bytes, function(byte) {
    return ('0' + (byte & 0xFF).toString(16)).slice(-2);
  }).join('');
}

function ascii2letter(asciiStr) {
  let str = hexStrip0x(asciiStr.trim());
  let len = str.length;
  if (len % 2 != 0) {
     return '';
  }
  let letterStr = [];
  for (var i = 0; i < len; i = i + 2) {
    let tmp = str.substr(i, 2);
    if (tmp !== '00') {
      letterStr.push(String.fromCharCode(parseInt(tmp, 16)));
    }
  }
  return letterStr.join('');
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
  if (network !== "testnet") {
    network = "prod";
  }
  if (((network === "testnet") && address.startsWith('2')) || ((network === "prod") && address.startsWith('3'))) {
    return false; // disble legacy segwit address
  }
  let valid = WAValidator.validate(address, 'LTC', network);
  return valid;
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

function isValidXdcAddress(address) {
  if (isValidEthAddress(address)) {
    return true;
  }
  return ((address.substr(0, 3) === "xdc") && isValidEthAddress("0x" + address.substr(3)));
}

function getXdcAddressInfo(address) {
  let native, evm;
  if (isValidEthAddress(address)) {
    evm = address;
    native = "xdc" + address.substr(2);
  } else if (isValidXdcAddress(address)) {
    native = address;
    evm = "0x" + address.substr(3);
  }
  return {native, evm};
}

function getStandardAddressInfo(chainType, address, extension = null) {
  if (chainType === "XDC") {
    return getXdcAddressInfo(address);
  } else if (extension && extension.tool && extension.tool.getStandardAddressInfo) {
    return extension.tool.getStandardAddressInfo(address);
  } else if (/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return {native: address, evm: address};
  } else {
    let evmBytes = web3.utils.asciiToHex(address);
    return {native: address, evm: evmBytes};
  }
}

function getCoinSymbol(chainType, chainName) {
  if ((chainType === "DOT") && ["PolkaTestnet", "testnet"].includes(chainName)) {
    return "WND";
  } else if ((chainType === "MOVR") && ["Moonbase Alpha", "testnet"].includes(chainName)) {
    return "DEV";
  } else {
    return chainType;
  }
}

function parseFee(fee, amount, unit, options) {
  options = Object.assign({formatWithDecimals: true}, options);
  let result = networkFee = new BigNumber(0), decimals = 0, tmp;
  if (fee.networkFee.unit === unit) {
    tmp = new BigNumber(fee.networkFee.value);
    if (tmp.gt(0) && fee.networkFee.isRatio) {
      tmp = tmp.times(amount);
      if ((fee.networkFee.min != 0) && (tmp.lt(fee.networkFee.min))) {
        tmp = fee.networkFee.min;
      } else if ((fee.networkFee.max != 0) && (tmp.gt(fee.networkFee.max))) {
        tmp = fee.networkFee.max;
      }
    }
    networkFee = tmp;
    if ((!options.feeType) || (options.feeType === "networkFee")) {
      result = result.plus(networkFee);
    }
    decimals = fee.networkFee.decimals;
  }
  if ((fee.operateFee.unit === unit) && ((!options.feeType) || (options.feeType === "operateFee"))) {
    tmp = new BigNumber(fee.operateFee.value);
    if (tmp.gt(0) && fee.operateFee.isRatio) {
      tmp = tmp.times(new BigNumber(amount).minus(networkFee));
      if ((fee.operateFee.min != 0) && (tmp.lt(fee.operateFee.min))) {
        tmp = fee.operateFee.min;
      } else if ((fee.operateFee.max != 0) && (tmp.gt(fee.operateFee.max))) {
        tmp = fee.operateFee.max;
      }
    }
    result = result.plus(tmp);
    decimals = fee.operateFee.decimals;
  }
  if (options.formatWithDecimals) {
    return new BigNumber(result.toFixed(decimals)).toFixed();
  } else {
    return result.times(Math.pow(10, decimals)).toFixed(0);
  }
}

function sha256(str) {
  let hash = crypto.createHash('sha256').update(str).digest('hex');
  return '0x' + hash;
}

function cmpAddress(address1, address2) {
  // compatible with tron '41' or xdc 'xdc' prefix
  return (address1.substr(-40).toLowerCase() == address2.substr(-40).toLowerCase());
}

function xrpNormalizeCurrencyCode(currencyCode, maxLength = 20) {
  if (!currencyCode) {
    return "";
  }
  if (currencyCode.length === 3 && currencyCode.trim().toLowerCase() !== 'xrp') {
      // "Standard" currency code
      return currencyCode.trim();
  }
  if (currencyCode.match(/^[a-fA-F0-9]{40}$/) && !isNaN(parseInt(currencyCode, 16))) {
      // Hexadecimal currency code
      const hex = currencyCode.toString().replace(/(00)+$/g, '');
      if (hex.startsWith('01')) {
          // Old demurrage code. https://xrpl.org/demurrage.html
          return xrpConvertDemurrageToUTF8(currencyCode);
      }
      if (hex.startsWith('02')) {
          // XLS-16d NFT Metadata using XLS-15d Concise Transaction Identifier
          // https://github.com/XRPLF/XRPL-Standards/discussions/37
          const xlf15d = Buffer.from(hex, 'hex').slice(8).toString('utf-8').slice(0, maxLength).trim();
          if (xlf15d.match(/[a-zA-Z0-9]{3,}/) && xlf15d.toLowerCase() !== 'xrp') {
              return xlf15d;
          }
      }
      const decodedHex = Buffer.from(hex, 'hex').toString('utf-8').slice(0, maxLength).trim();
      if (decodedHex.match(/[a-zA-Z0-9]{3,}/) && decodedHex.toLowerCase() !== 'xrp') {
          // ASCII or UTF-8 encoded alphanumeric code, 3+ characters long
          return decodedHex;
      }
  }
  return "";
}

function xrpConvertDemurrageToUTF8(demurrageCode) {
  let bytes = Buffer.from(demurrageCode, "hex");
  let code = String.fromCharCode(bytes[1]) + String.fromCharCode(bytes[2]) + String.fromCharCode(bytes[3]);
  let interest_start = (bytes[4] << 24) + (bytes[5] << 16) + (bytes[6] <<  8) + (bytes[7]);
  let interest_period = bytes.readDoubleBE(8);
  const year_seconds = 31536000; // By convention, the XRP Ledger's interest/demurrage rules use a fixed number of seconds per year (31536000), which is not adjusted for leap days or leap seconds
  let interest_after_year = Math.pow(Math.E, (interest_start+year_seconds - interest_start) / interest_period)
  let interest = (interest_after_year * 100) - 100;
  return (`${code} (${interest}% pa)`);
}

function parseXrpTokenPairAccount(tokenAccount, normalizeCurrency) {
  let tokenInfo = ascii2letter(hexStrip0x(tokenAccount));
  let [issuer, currency] = tokenInfo.split(":");
  if (normalizeCurrency) {
    currency = xrpNormalizeCurrencyCode(currency);
  }
  return [currency, issuer];
}

function validateXrpTokenAmount(amount) {
  let v = new BigNumber(amount).toExponential();
  let [p, e] = v.split("e");
  if ((p.replace(/\./g, '').length > 16) || (e > 95) || (e < -81)) {
    return false;
  }
  return true;
}

function parseTokenPairSymbol(chain, symbol) {
  if ((chain === "XRP") || (chain == '2147483792')) {
    return xrpNormalizeCurrencyCode(symbol) || symbol;
  } else {
    return symbol;
  }
}

function getErrMsg(err, defaultMsg) {
  if (typeof(err) === "string") {
    return err;
  }
  if (err.message && (typeof(err.message) === "string")) {
    return err.message;
  }
  let msg = err.toString();
  if (msg && (msg[0] !== '[') && (msg[msg.length-1] !== ']')) { // "[object Object]"
    return msg;
  }
  return defaultMsg;
}

module.exports = {
  getCurTimestamp,
  checkTimeout,
  sleep,
  hexStrip0x,
  bytes2Hex,
  ascii2letter,
  isValidEthAddress,
  isValidWanAddress,
  isValidBtcAddress,
  isValidLtcAddress,
  isValidDogeAddress,
  isValidXrpAddress,
  isValidXdcAddress,
  getStandardAddressInfo,
  getCoinSymbol,
  parseFee,
  sha256,
  cmpAddress,
  parseXrpTokenPairAccount,
  validateXrpTokenAmount,
  parseTokenPairSymbol,
  getErrMsg
}