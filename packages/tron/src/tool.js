import TronWeb from "tronweb";
const tronweb = new TronWeb({ fullHost: "https://api.nileex.io" });
function validateAddress(address) {
    let isValid = tronweb.isAddress(address);
    if (isValid) {
        return (address.substr(0, 2) !== "41");
    }
    else {
        return false;
    }
}
function getStandardAddressInfo(address) {
    let native, evm;
    if (/^0x[0-9a-fA-F]{40}$/.test(address)) { // standard evm address
        evm = address;
        tronweb.setAddress("41" + address.substr(2));
        native = tronweb.defaultAddress.base58;
    }
    else if (/^[0-9a-fA-F]{40}$/.test(address)) { // short evm address
        evm = "0x" + address;
        tronweb.setAddress("41" + address);
        native = tronweb.defaultAddress.base58;
    }
    else if (tronweb.isAddress(address)) {
        tronweb.setAddress(address);
        evm = "0x" + tronweb.defaultAddress.hex.substr(2);
        native = tronweb.defaultAddress.base58;
    }
    else {
        throw new Error("Tron address is invalid: " + address);
    }
    // ignore cctp address as it is not supported now
    return { native, evm, text: evm, compact: evm }; // always treat tron as evm except ui, so text address is evm format
}
export { validateAddress };
export { getStandardAddressInfo };
export default {
    validateAddress,
    getStandardAddressInfo
};
