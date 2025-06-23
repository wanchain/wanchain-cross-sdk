const {Address, beginCell: sdkBeginCell, internal, storeMessage} = require("@ton/core");
const {getSecureRandomNumber} = require('@ton/crypto');

function validateAddress(address, network) {
  try {
    if (Address.isFriendly(address)) {
      let addr = Address.parseFriendly(address);
      // console.log({addr})
      // let rawAddr = addr.address.toRawString();
      // console.log({rawAddr});
      // let raw = Address.parseRaw(rawAddr);
      // console.log("str: %s", raw.toString({testOnly: true, bounceable: true}))
      return (addr.isTestOnly === (network === "testnet"));
    } else {
      return false;
    }
  } catch (err) {
    return false;
  }
}

function parseAddress(source) {
  return Address.parse(source);
}

async function getQueryId() {
  return getSecureRandomNumber(1, (Math.pow(2, 52) - 1));
}

function beginCell() {
  return sdkBeginCell();
}

function buildInternalMessage(opts) { // {to, value, bounce, init, body}
  return internal(opts);
}

function getMsgHash(msg) {
  return sdkBeginCell().store(storeMessage(m)).endCell().hash().toString('hex');
}

const tools = {
  validateAddress,
  parseAddress,
  getQueryId,
  beginCell,
  buildInternalMessage,
  getMsgHash,
}

export default tools;