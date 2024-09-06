"use strict";

let Dexie;

if (typeof(window) !== "undefined") {
  Dexie = require('dexie').default;
}

class IndexedDbService {
  constructor() {
    this.db = new Dexie('WanBridgeDb');
  }

  async init(frameworkService) {
    this.db.version(1).stores({
      AssetLogo: '&name',
      ChainLogo: '&name',
      TokenPair: '&id, _ver'
    });
  }

  async getCacheData(table, _ver = "") {
    let items;
    if (_ver) {
      items = await this.db[table].where('_ver').equals(_ver).toArray();
    } else {
      items = await this.db[table].toArray();
    }
    return items;
  }

  async setCacheData(table, items) {
    await this.db[table].bulkPut(items);
  }
};

module.exports = IndexedDbService;