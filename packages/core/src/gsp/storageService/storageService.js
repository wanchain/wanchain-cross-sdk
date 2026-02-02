import low from "lowdb";
import LocalStorage from "lowdb/adapters/LocalStorage";
import FileSync from "lowdb/adapters/FileSync";

let adapter;
if (typeof (window) !== "undefined") {
  adapter = new LocalStorage('WanBridgeDb');
} else {
  adapter = new FileSync('./WanBridgeDb.json');
}

const db = low(adapter);

//let all = {
//    "StorageService_stores": [
//        "storename1",
//        "storename2",
//        "..."
//    ],
//    "storename1_keys": [
//        "key1",
//        "key2",
//        "..."
//    ],
//    "storename1_key1": "value",
//    "storename1_key2": "value",
//    "storename2_keys": [
//        "key1",
//        "key2",
//        "..."
//    ]
//}

/* do not limit item number on save or update, check and delete oldest items on next init load.
   keep records in lowdb to support both nodejs and web, do not move to indexedDb.
*/
const ITEM_NUM_MAX = 200;

class StorageService {
  constructor() {
    this.mapStoreKeys = new Map(); // storeName => ["key1","key2","..."]
  }

  async init(frameworkService) {
    this.frameworkService = frameworkService;
    this.webStores = this.frameworkService.getService("WebStores");
    await db.read();
  }

  async init_load(mainKey) {
    this.mapStoreKeys.clear();
    try {
      let storeNames = JSON.parse(db.get("StorageService_storeNames").value() || "[]");
      for (let i = 0; i < storeNames.length; i++) {
        let storeName = storeNames[i];
        let storeKeys = JSON.parse(db.get(storeName + "_keys").value() || "[]");
        let truncateNum = 0;
        if ((storeName === mainKey) && (storeKeys.length > ITEM_NUM_MAX)) {
          truncateNum = storeKeys.length - ITEM_NUM_MAX;
          console.log("truncate %d/%d %s records", truncateNum, storeKeys.length, storeName);
        }
        let tasks = [], keysMap = new Map();
        for (let j = 0; j < storeKeys.length; j++) {
          let innerKey = storeKeys[j];
          let dbKey = storeName + "_" + innerKey;
          if (j < truncateNum) { // delete exceed oldest items
            await db.unset(dbKey).write(); // unset do not support batch lazy execution, need call write every one
            console.log("delete record %s", dbKey);
          } else {
            tasks.push(JSON.parse(db.get(dbKey).value()));
            keysMap.set(innerKey, true);
          }
        }
        if (truncateNum) { // update storeKeys
          await db.set(storeName + "_keys", JSON.stringify(storeKeys.slice(truncateNum))).write();
        }
        this.mapStoreKeys.set(storeName, keysMap);
        let processInst = await this.getProcessInst(storeName);
        if (processInst) {
          processInst.loadTradeTask(tasks);
        }
      }
    } catch (err) {
      console.error("storageService load error: %O", err);
    }
  }

  async getProcessInst(storeName) {
    let storeInst = this.webStores[storeName];
    if (storeInst) {
      return storeInst;
    }
    let serviceInst = this.frameworkService.getService(storeName);
    return serviceInst;
  }

  async save(storeName, key, val) {
    let dbOps = db;
    let keysMap = this.mapStoreKeys.get(storeName);
    if (!keysMap) {
      keysMap = new Map();
      this.mapStoreKeys.set(storeName, keysMap);
      let storeNames = this.getKeyAryFromMap(this.mapStoreKeys);
      dbOps = dbOps.set("StorageService_storeNames", JSON.stringify(storeNames));
    }
    if (!keysMap.has(key)) {
      keysMap.set(key, true);
      let storeKeys = this.getKeyAryFromMap(keysMap);
      dbOps = dbOps.set(storeName + "_keys", JSON.stringify(storeKeys));
    }
    await dbOps.set(storeName + "_" + key, JSON.stringify(val)).write();
  }

  async delete(storeName, key) {
    let keysMap = this.mapStoreKeys.get(storeName);
    if (keysMap && keysMap.has(key)) {
      keysMap.delete(key);
      let storeKeys = this.getKeyAryFromMap(keysMap);
      if (storeKeys.length > 0) {
        await db.set(storeName + "_keys", JSON.stringify(storeKeys)).write();
      } else {
        await db.unset(storeName + "_keys").write();
        this.mapStoreKeys.delete(storeName);
        let storeNames = this.getKeyAryFromMap(this.mapStoreKeys);
        if (storeNames.length > 0) {
          await db.set("StorageService_storeNames", JSON.stringify(storeNames)).write();
        } else {
          await db.unset("StorageService_storeNames").write();
        }
      }
      await db.unset(storeName + "_" + key).write();
    }
  }

  getKeyAryFromMap(paraMap) {
    let keys = []; // the same order as the set operations
    for (let [key,] of paraMap) {
      keys.push(key);
    }
    return keys;
  }

  getCacheData(name, json2obj = true) {
    if (typeof (window) !== "undefined") {
      let data = window.localStorage.getItem(name);
      if (data) {
        if (json2obj) {
          data = JSON.parse(data);
        }
        return data;
      }
    }
    return null;
  }

  setCacheData(name, data) {
    if (typeof (window) !== "undefined") {
      if (typeof (data) !== "string") {
        data = JSON.stringify(data);
      }
      window.localStorage.setItem(name, data);
    }
  }

  removeCacheData(key) {
    window.localStorage.removeItem(key);
  }
}

export default StorageService;
