/* A simple in-memory implementation of private state provider */

export const PrivateStateProvider = () => {
  const record = new Map();
  const signingKeys = {};
  let contractAddress = null;

  return {
    setContractAddress(address) {
      contractAddress = address;
      return Promise.resolve();
    },

    set(key, state) {
      record.set(key, state);
      return Promise.resolve();
    },

    get(key) {
      const value = record.get(key) ?? null;
      return Promise.resolve(value);
    },

    remove(key) {
      record.delete(key);
      return Promise.resolve();
    },

    clear() {
      record.clear();
      return Promise.resolve();
    },

    setSigningKey(contractAddress, signingKey) {
      signingKeys[contractAddress] = signingKey;
      return Promise.resolve();
    },

    getSigningKey(contractAddress) {
      const value = signingKeys[contractAddress] ?? null;
      return Promise.resolve(value);
    },

    removeSigningKey(contractAddress) {
      delete signingKeys[contractAddress];
      return Promise.resolve();
    },

    clearSigningKeys() {
      Object.keys(signingKeys).forEach((contractAddress) => {
        delete signingKeys[contractAddress];
      });
      return Promise.resolve();
    },
  };
};