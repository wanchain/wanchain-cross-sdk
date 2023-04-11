const wasmBg = require("./cardano_serialization_lib_bg.js");

let wasm = null;

async function init() {
  let source = require("./cardano_serialization_lib_bg.wasm");
  const fetchPromise = fetch(source);
  const imports = {"__wbindgen_placeholder__": Object.assign({}, wasmBg)};
  const {instance} = await WebAssembly.instantiateStreaming(fetchPromise, imports);
  wasmBg.setWasm(instance.exports);
  wasm = wasmBg;
}

function getWasm() {
  return wasm;
}

module.exports = {
  init,
  getWasm,
}