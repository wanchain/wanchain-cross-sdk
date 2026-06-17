import CoinSelection from "./coinSelection.js";
import axios from "axios";
import BigNumber from "bignumber.js";

let wasm = null;

function setWasm(_wasm) {
  wasm = _wasm;
}

function getWasm() {
  return wasm;
}

function bytesAddressToBinary(bytes) {
  return bytes.reduce((str, byte) => str + byte.toString(2).padStart(8, '0'), '');
}

// WAValidator can not valid testnet address
function validateAddress(address, options = {}) { // options: {network, chain, retScriptHash}
  let networkId = (options.network === "testnet") ? 0 : 1;
  try {
    if ((address.substr(0, 3) === "Ae2") || (address.substr(0, 2) === "Dd")) { // Byron
      let addr = wasm.ByronAddress.from_base58(address);
      if (addr) {
        console.debug("%s is ADA Byron base58 address", address);
        return (addr.network_id() === networkId);
      }
    } else if ((address.substr(0, 5) === "addr1") || (address.substr(0, 10) === "addr_test1")) { // Shelley
      let addr = wasm.Address.from_bech32(address);
      if (addr.network_id() === networkId) {
        let prefix = bytesAddressToBinary(addr.to_bytes()).slice(0, 4);
        console.debug("%s is ADA Shelly type %s address", address, prefix);
        if (parseInt(prefix, 2) <= 7) {
          let typedAddr = wasm.BaseAddress.from_address(addr) || wasm.EnterpriseAddress.from_address(addr);
          if (typedAddr) {
            let payCred = typedAddr.payment_cred();
            let kind = payCred.kind();
            if (kind === wasm.CredKind.Key) {
              return true;
            } else if (options.retScriptHash) {
              return payCred.to_scripthash().to_hex(); // to further check if only accept specified script hashs
            } else {
              return true;
            }
          }
        }
      }
    }
  } catch (err) {
    console.debug("ADA validate networkId %s address %s error: %O", networkId, address, err);
  }
  return false;
}

function getStandardAddressInfo(address) {
  try {
    let addr;
    if ((address.substr(0, 3) === "Ae2") || (address.substr(0, 2) === "Dd")) { // Byron
      addr = wasm.ByronAddress.from_base58(address);
    } else if ((address.substr(0, 5) === "addr1") || (address.substr(0, 10) === "addr_test1")) { // Shelley
      addr = wasm.Address.from_bech32(address);
    }
    let native = address;
    let evm = asciiToHex(native);
    // ignore cctp address as it is not supported now
    let compact = '0x' + Buffer.from(addr.to_bytes()).toString('hex');
    return { native, evm, text: native, compact };
  } catch (err) {
    throw new Error("Cardano address is invalid: " + address);
  }
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

function assetsToValue(assets) {
  let multiAsset = wasm.MultiAsset.new();
  let lovelace = assets.find((asset) => asset.unit === 'lovelace');
  let policies = [
    ...new Set(
      assets
        .filter((asset) => asset.unit !== 'lovelace')
        .map((asset) => asset.unit.slice(0, 56))
    ),
  ];
  policies.forEach((policy) => {
    let policyAssets = assets.filter(
      (asset) => asset.unit.slice(0, 56) === policy
    );
    let assetsValue = wasm.Assets.new();
    policyAssets.forEach((asset) => {
      assetsValue.insert(
        wasm.AssetName.new(Buffer.from(asset.unit.slice(56), 'hex')),
        wasm.BigNum.from_str(asset.quantity)
      );
    });
    multiAsset.insert(
      wasm.ScriptHash.from_bytes(Buffer.from(policy, 'hex')),
      assetsValue
    );
  });
  let value = wasm.Value.new(
    wasm.BigNum.from_str(lovelace ? lovelace.quantity : '0')
  );
  if (assets.length > 1 || !lovelace) value.set_multiasset(multiAsset);
  return value;
}

// Neither min_ada_required nor min_ada_for_output can calculate correct value
function minAdaRequired(output, coinsPerUtxoByte) {
  return ((160 + output.to_bytes().byteLength) * coinsPerUtxoByte).toString();
}

function multiAssetCount(multiAsset) {
  if (!multiAsset) return 0;
  let count = 0;
  let policies = multiAsset.keys();
  for (let i = 0; i < policies.len(); i++) {
    let policy = policies.get(i);
    let policyAssets = multiAsset.get(policy);
    let assetNames = policyAssets.keys();
    count += assetNames.len();
  }
  return count;
}

function getAssetBalance(multiAsset, policyId, name) {
  if (multiAsset && multiAsset.len()) {
    let ma = multiAsset.to_js_value();
    let policy = ma.get(policyId);
    if (policy) {
      let value = policy.get(name);
      return value || "0";
    }
  }
  return "0";
}

function getNftInfo(multiAsset, policyId) {
  let nfts = [];
  if (multiAsset && multiAsset.len()) {
    let ma = multiAsset.to_js_value();
    let policy = ma.get(policyId);
    if (policy) {
      for (let [id, balance] of policy) {
        nfts.push({ id, balance }); // id is hex without 0x prefix
      }
    }
  }
  return nfts;
}

function selectUtxos(utxos, rawOutput, protocolParameters) {
  let output = wasm.TransactionOutput.new(
    wasm.Address.from_bech32(rawOutput.address),
    assetsToValue(rawOutput.amount)
  );
  let totalAssets = multiAssetCount(output.amount().multiasset());
  CoinSelection.setProtocolParameters(
    protocolParameters.coinsPerUtxoByte,
    protocolParameters.linearFee.minFeeA,
    protocolParameters.linearFee.minFeeB,
    protocolParameters.maxTxSize.toString()
  );
  let outputs = wasm.TransactionOutputs.new();
  outputs.add(output); // adapt to CoinSelection api
  try {
    let selection = CoinSelection.randomImprove(
      utxos,
      outputs,
      20 + totalAssets,
      rawOutput.address
    );
    return selection.input;
  } catch (err) {
    console.error("cardano selectUtxos error: %O", err);
    return [];
  }
}

function genPlutusData() { // just dummy data
  let ls = wasm.PlutusList.new();
  ls.add(wasm.PlutusData.new_integer(wasm.BigInt.from_str('1')));
  return wasm.PlutusData.new_constr_plutus_data(
    wasm.ConstrPlutusData.new(
      wasm.BigNum.from_str('0'),
      ls
    )
  )
}

function showUtxos(utxos, title = "") {
  utxos.map((utxo, i) => {
    if (typeof (utxo) === "string") {
      utxo = wasm.TransactionUnspentOutput.from_hex(utxo);
    }
    console.debug("%s utxo %d: %O", title, i, utxo.to_js_value());
  });
}

function splitMetadata(metadata, segmentLength = 64) {
  let result = [];
  for (let cur = 0; cur < metadata.length; cur = cur + segmentLength) {
    result.push(metadata.substr(cur, segmentLength));
  }
  return (result.length === 1)? result[0] : result;
}

function sleep(time) {
  return new Promise(function (resolve) {
    setTimeout(function () {
      resolve();
    }, time);
  })
}

const OgmiosUrl = {
  mainnet: "https://nodes.wandevs.org/cardano",
  testnet: "https://nodes-testnet.wandevs.org/cardano"
};

async function evaluateTx(network, rawTx) {
  try {
    let res = await axios.post(OgmiosUrl[network] + "/evaluateTx", { rawTx });
    return res.data;
  } catch (err) {
    console.error("evaluateTx error: %O", err);
    throw new Error("Network Instability Detected");
  }
}

async function checkUtxos(network, utxos, timeout = 0, interval = 5000) { // ms
  let checkUtxos = utxos.map(v => {
    let input = v.to_js_value().input;
    return {
      txId: input.transaction_id,
      index: input.index
    }
  });
  let t0 = Date.now();
  for (; ;) {
    let chainUtxos = [], networkErr = false;
    try {
      let res = await axios.post(OgmiosUrl[network] + "/getUTXOs", checkUtxos);
      // console.log("checkUtxos res: %O", res);
      chainUtxos = res.data;
      networkErr = false;
    } catch (err) {
      networkErr = true;
      console.error("checkUtxos error: %O", err);
    }
    if (chainUtxos.length >= utxos.length) {
      return true;
    } else if ((Date.now() - t0) < timeout) {
      await sleep(interval);
    } else {
      console.debug("check utxos %d ms unavailable: %O", timeout, checkUtxos);
      if (networkErr) {
        throw new Error("Network Instability Detected");
      } else {
        return false;
      }
    }
  }
}

function crc8(buffer) {
  let crc = 0x00;
  for (let i = 0; i < buffer.length; i++) {
    crc ^= buffer[i];
    for (let j = 0; j < 8; j++) {
      if (crc & 0x80) {
        crc = (crc << 1) ^ 0x07;
      } else {
        crc = crc << 1;
      }
    }
  }
  return crc & 0xff;
}

function encodeNftAssetName(id, typeCode = 333) {
  let buffer = Buffer.alloc(2);
  buffer.writeUint16BE(typeCode)
  let crcValue = crc8(buffer);
  let label = '0' + buffer.toString('hex') + crcValue.toString(16).padStart(2, '0') + '0';
  let idHex = new BigNumber(id).toString(16);
  if (idHex.length % 2) {
    idHex = '0' + idHex;
  }
  return label + idHex;
}

function nftId2AssetName(id) {
  let tmp = new BigNumber(id).toString(16);
  if (tmp.substr(0, 2) === 'de') { // 222
    return '000' + tmp;
  } else if (tmp.substr(0, 3) === '14d') { // 333
    return '00' + tmp;
  }
  throw new Error("unsupported nft type");
}

export { setWasm };
export { getWasm };
export { validateAddress };
export { getStandardAddressInfo };
export { assetsToValue };
export { minAdaRequired };
export { multiAssetCount };
export { getAssetBalance };
export { getNftInfo };
export { encodeNftAssetName };
export { nftId2AssetName };
export { selectUtxos };
export { genPlutusData };
export { showUtxos };
export { splitMetadata };
export { evaluateTx };
export { checkUtxos };

export default {
  setWasm,
  getWasm,
  validateAddress,
  getStandardAddressInfo,
  assetsToValue,
  minAdaRequired,
  multiAssetCount,
  getAssetBalance,
  getNftInfo,
  encodeNftAssetName,
  nftId2AssetName,
  selectUtxos,
  genPlutusData,
  showUtxos,
  splitMetadata,
  evaluateTx,
  checkUtxos
};
