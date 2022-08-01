const wanUtil = require('wanchain-util');
const ethUtil = require('ethereumjs-util');
const { encodeAddress } = require('@polkadot/keyring');
const wasm = require("@emurgo/cardano-serialization-lib-asmjs");
const WAValidator = require('multicoin-address-validator');
const BigNumber = require('bignumber.js');
const crypto = require('crypto');
const Web3 = require("web3");
const TronWeb = require('tronweb');

// self define to reduce imported package size
const PolkadotSS58Format = {
	polkadot: 0,
	kusama: 2,
	westend: 42,
	substrate: 42,
};

const web3 = new Web3();
const tronweb = new TronWeb("https://api.nileex.io", "https://api.nileex.io", "https://api.nileex.io");

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

function isValidDotAddress(account, network) {  
  try {
    let format = ("testnet" === network)? PolkadotSS58Format.westend : PolkadotSS58Format.polkadot;
    let addr = encodeAddress(account, format);
    console.log("DOT %s account %s formatted to %s", network, account, addr);
    return (account === addr);
  } catch(err) {
    console.log("DOT %s account %s is invalid: %s", network, account, err);
    return false;
  }
}

function bytesAddressToBinary(bytes) {
  return bytes.reduce((str, byte) => str + byte.toString(2).padStart(8, '0'), '');
}

// WAValidator can not valid testnet address
function isValidAdaAddress(address, network) {
  const networkId = (network === "testnet")? 0 : 1;
  try {
    let addr = wasm.ByronAddress.from_base58(address);
    console.debug("%s is ADA Byron base58 address", address);
    return (addr.network_id() === networkId);
  } catch (e) {
    console.debug("%s is not ADA Byron base58 address: %O", address, e);
  }
  try {
    let addr = wasm.Address.from_bech32(address);
    try {
      let byronAddr = wasm.ByronAddress.from_address(addr);
      if (byronAddr) {
        console.debug("%s is ADA Byron bech32 address", address);
      }
      return (byronAddr.network_id() === networkId); // byronAddr is undefined to throw error
    } catch (e) {
      let prefix = bytesAddressToBinary(addr.to_bytes()).slice(0, 4);
      console.log("%s is Shelly type %s address", address, prefix);
      if (parseInt(prefix, 2) > 7) {
        return false;
      }
      return (addr.network_id() === networkId);
    }
  } catch (e) {
    console.debug("%s is not ADA bech32 address: %O", address, e);
  }
  return false;
}

function isValidXdcAddress(address) {
  if (isValidEthAddress(address)) {
    return true;
  }
  return ((address.substr(0, 3) === "xdc") && isValidEthAddress("0x" + address.substr(3)));
}

function isValidTrxAddress(address) {
  let valid = WAValidator.validate(address, 'TRX');
  return valid;
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

function getTrxAddressInfo(address) {
  let native, evm;
  if (/^0x[0-9a-fA-F]{40}$/.test(address)) { // standard evm address
    evm = address;
    tronweb.setAddress("41" + address.substr(2));
    native = tronweb.defaultAddress.base58;
  } else if (/^[0-9a-fA-F]{40}$/.test(address)) { // short evm address
    evm = "0x" + address;
    tronweb.setAddress("41" + address);
    native = tronweb.defaultAddress.base58;
  } else if (tronweb.isAddress(address)) {
    tronweb.setAddress(address);
    evm = "0x" + tronweb.defaultAddress.hex.substr(2);
    native = tronweb.defaultAddress.base58;
  }
  return {native, evm};
}

function getStandardAddressInfo(chainType, address) {
  if (chainType === "XDC") {
    return getXdcAddressInfo(address);
  } else if (chainType === "TRX") {
    return getTrxAddressInfo(address);
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

function parseFee(fee, amount, unit, decimals, formatWithDecimals = true) {
  let result = new BigNumber(0), tmp;
  decimals = Number(decimals);
  if (fee.operateFee.unit === unit) {
    tmp = new BigNumber(fee.operateFee.value);
    if (fee.operateFee.isRatio) {
      tmp = tmp.times(amount).toFixed(decimals);
    }
    result = result.plus(tmp);
  }
  if (fee.networkFee.unit === unit) {
    tmp = new BigNumber(fee.networkFee.value);
    if (fee.networkFee.isRatio) {
      tmp = tmp.times(amount).toFixed(decimals);
    }
    result = result.plus(tmp);
  }
  if (!formatWithDecimals) {
    result = result.multipliedBy(Math.pow(10, decimals));
  }
  return result.toFixed();
}

function sha256(str) {
  let hash = crypto.createHash('sha256').update(str).digest('hex');
  return '0x' + hash;
}

function cmpAddress(address1, address2) {
  // compatible with tron '41' or xdc 'xdc' prefix
  return (address1.substr(-40).toLowerCase() == address2.substr(-40).toLowerCase());
}

module.exports = {
  PolkadotSS58Format,
  getCurTimestamp,
  checkTimeout,
  sleep,
  hexStrip0x,
  bytes2Hex,
  isValidEthAddress,
  isValidWanAddress,
  isValidBtcAddress,
  isValidLtcAddress,
  isValidDogeAddress,
  isValidXrpAddress,
  isValidDotAddress,
  isValidAdaAddress,
  isValidXdcAddress,
  isValidTrxAddress,
  getStandardAddressInfo,
  getCoinSymbol,
  parseFee,
  sha256,
  cmpAddress
}