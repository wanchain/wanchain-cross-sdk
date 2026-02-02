import * as wasmBg from "./cardano_serialization_lib_bg.js";

const wasmUrl = new URL("./cardano_serialization_lib_bg.wasm", import.meta.url).href;

let wasm = null;
async function init() {
  if (!wasm) {
    const response = await fetch(wasmUrl);
    const imports = { "__wbindgen_placeholder__": Object.assign({}, wasmBg) };
    const { instance } = await WebAssembly.instantiateStreaming(response, imports);
    wasmBg.__wbg_set_wasm(instance.exports);
    wasm = wasmBg;
  }
}

function getWasm() {
  return wasm;
}

export { init };
export { getWasm };

export default {
  init,
  getWasm
};
