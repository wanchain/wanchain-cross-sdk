const { encodeAddress } = require('@polkadot/keyring');

// self define to reduce imported package size
const SS58Format = {
  polkadot: 0,
  kusama: 2,
  phala: 30,
  westend: 42,
  substrate: 42,
};

function getSS58Format(chain, network) {
  if (["DOT", "Polkadot"].includes(chain)) {
    return (network === "mainnet")? SS58Format.polkadot : SS58Format.westend;
  } else if (["PHA", "Phala"].includes(chain)) {
    return (network === "mainnet")? SS58Format.phala : SS58Format.phala;
  } else {
    throw new Error("unsupported polkadot chain " + chain);
  }
}

function validateAddress(account, network, chain) {
  try {
    let format = getSS58Format(chain, network);
    let addr = encodeAddress(account, format);
    console.log("polkadot %s %s account %s formatted to %s", chain, network, account, addr);
    return (account === addr);
  } catch(err) {
    console.log("polkadot %s %s account %s is invalid: %s", chain, network, account, err);
    return false;
  }
}

module.exports = {
  getSS58Format,
  validateAddress,
}