const wasmBg = require("./cardano_serialization_lib_bg.js");

let wasm = null;

async function init() {
  let source = require("./cardano_serialization_lib_bg.wasm");
  const fetchPromise = fetch(source);
  const imports = { "__wbindgen_placeholder__": Object.assign({}, wasmBg)};
  const { instance } = await WebAssembly.instantiateStreaming(fetchPromise, imports);
  console.log("wasm instance: %O", instance)
  wasmBg.setWasm(instance.exports);
  wasm = wasmBg;
  console.log("wasm instance.exports: %O", instance.exports);
}

function getWasm() {
  return wasm;
}

module.exports = {
  init,
  getWasm,
}