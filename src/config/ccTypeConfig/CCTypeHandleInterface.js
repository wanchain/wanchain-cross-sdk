'use strict';

module.exports = class CCTypeHandleInterface {
  constructor() {
    if (new.target === CCTypeHandleInterface) {
      throw new TypeError("Cannot construct Abstract class directly");
    }
  }

  async process(tokenPairObj, convertJson) {
    throw new Error("Abstract method!");
  }
};

