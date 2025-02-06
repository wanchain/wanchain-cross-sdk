const Address = require('tonweb').Address;
const WanTonSdk = require('wan-ton-bridge');

function validateAddress(address, network) {
  try {
    let addr = new Address(address);
    if (addr.isUserFriendly) {
      let checkTest = (network === "testnet");
      return (addr.isTestOnly === checkTest);
    } else {
      return false;
    }
  } catch (err) {
    return false;
  }
}

function getStandardAddressInfo(address) { // only support user friendly address, otherwise need check network
  let native = address;
  let evm = asciiToHex(native);
  return {native, evm, ascii: native, cctp: ""};
}

// according to web3.utils.asciiToHex
function asciiToHex(str) {
	let hexString = '';
	for (let i = 0; i < str.length; i += 1) {
		const hexCharCode = str.charCodeAt(i).toString(16);
		// might need a leading 0
		hexString += hexCharCode.length % 2 !== 0 ? ('0' + hexCharCode) : hexCharCode;
	}
	return '0x' + hexString;
}

function buildUserTxMsg(crossScAddr, smgID, tokenPairID, crossValue, userAccount, extInfo) {
  let msgs = [];
  return msgs;
}

function getMsgHash(msgs) {
  return WanTonSdk.getMsgHash(msgs);
}

const tools = {
  validateAddress,
  getStandardAddressInfo,
  buildUserTxMsg,
  getMsgHash,
}

export default tools;