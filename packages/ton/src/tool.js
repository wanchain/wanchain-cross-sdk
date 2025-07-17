const {Address, Cell, beginCell: sdkBeginCell} = require("@ton/core");
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
  let queryId = await getSecureRandomNumber(1, (Math.pow(2, 52) - 1));
  if (queryId < 0) {
    queryId = -queryId;
  }
  return queryId;
}

function msg2Cell(body) {
  return Cell.fromBase64(body);
}

function beginCell() {
  return sdkBeginCell();
}

const tools = {
  validateAddress,
  parseAddress,
  getQueryId,
  msg2Cell,
  beginCell
}

export default tools;