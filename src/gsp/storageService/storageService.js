"use strict";

const low = require('lowdb');

let adapter;
if (typeof(window) !== "undefined") {
    const LocalStorage = require('lowdb/adapters/LocalStorage');
    adapter = new LocalStorage('WanBridgeDb');
} else {
    const FileSync = require('lowdb/adapters/FileSync');
    adapter = new FileSync('./WanBridgeDb.json');
}
const db = low(adapter);

// 存储格式参考
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

class StorageService {
    constructor() {
        this.m_mapStoreKeys = new Map();// storeName => ["key1","key2","..."]
    }

    async init(frameworkService) {
        this.m_frameworkService = frameworkService;
        this.m_WebStores = this.m_frameworkService.getService("WebStores");
        await db.read();
    }

    async init_load() {
        this.m_mapStoreKeys.clear();
        let storeNamesStr = db.get("StorageService_storeNames").value();
        if (storeNamesStr) {
            let storeNamesAry = JSON.parse(storeNamesStr);
            for (let idx = 0; idx < storeNamesAry.length; ++idx) {
                let storeName = storeNamesAry[idx];
                let key = storeName + "_keys";
                let storeKeysStr = db.get(key).value();
                if (storeKeysStr) {
                    try {
                        let storeKeysAry = JSON.parse(storeKeysStr);
                        let valueAry = [];
                        let storeKeysMap = new Map();
                        for (let storeKeyIdx = 0; storeKeyIdx < storeKeysAry.length; ++storeKeyIdx) {
                            try {
                                let keyName = storeKeysAry[storeKeyIdx];
                                key = storeName + "_" + keyName;
                                let value = db.get(key).value();
                                valueAry.push(JSON.parse(value));
                                storeKeysMap.set(keyName, true);
                            } catch (err) {
                                console.log("init_load 1 err:", err);
                            }
                        }
                        this.m_mapStoreKeys.set(storeName, storeKeysMap);
                        // 初始加载
                        try {
                            let processInst = await this.getProcessInst(storeName);
                            if (processInst) {
                                processInst.loadTradeTask(valueAry);
                            }
                        } catch (err) {
                            console.log("init_load 2 err:", err);
                        }
                    } catch (err) {
                        console.log("init_load 3 err:", err);
                    }
                }
            }
        } else if (typeof(window) !== "undefined") { // try to migrate old version history to lowdb for compatibility, delete later
            console.log("try to migrate old version history");
            await this.loadLegacy();
        }
    }

    async loadLegacy() {
        let storeNamesStr = window.localStorage.getItem("StorageService_storeNames");
        if (storeNamesStr) {
            db.set("StorageService_storeNames", storeNamesStr).write();
            let storeNamesAry = JSON.parse(storeNamesStr);
            for (let idx = 0; idx < storeNamesAry.length; ++idx) {
                let storeName = storeNamesAry[idx];
                let key = storeName + "_keys";
                let storeKeysStr = window.localStorage.getItem(key);
                if (storeKeysStr) {
                    await db.set(key, storeKeysStr).write();
                    try {
                        let storeKeysAry = JSON.parse(storeKeysStr);
                        let valueAry = [];
                        let storeKeysMap = new Map();
                        for (let storeKeyIdx = 0; storeKeyIdx < storeKeysAry.length; ++storeKeyIdx) {
                            try {
                                let keyName = storeKeysAry[storeKeyIdx];
                                key = storeName + "_" + keyName;
                                let value = window.localStorage.getItem(key);
                                await db.set(key, value).write();
                                valueAry.push(JSON.parse(value));
                                storeKeysMap.set(keyName, true);
                            } catch (err) {
                                console.log("init_load 1 err:", err);
                            }
                        }
                        this.m_mapStoreKeys.set(storeName, storeKeysMap);
                        // 初始加载
                        try {
                            let processInst = await this.getProcessInst(storeName);
                            if (processInst) {
                                processInst.loadTradeTask(valueAry);
                            }
                        } catch (err) {
                            console.log("init_load 2 err:", err);
                        }
                    } catch (err) {
                        console.log("init_load 3 err:", err);
                    }
                }
            }
        }
    }

    async getProcessInst(storeName) {
        let storeInst = this.m_WebStores[storeName];
        if (storeInst) {
            return storeInst;
        }
        let serviceInst = this.m_frameworkService.getService(storeName);
        return serviceInst;
    }

    async save(storeName, key, val) {
        if (this.m_mapStoreKeys.has(storeName)) {
            let storeKeysMap = this.m_mapStoreKeys.get(storeName);
            if (!storeKeysMap.has(key)) {
                storeKeysMap.set(key, true);
                let storeKeysAry = this.getKeyAryFromMap(storeKeysMap);
                await db.set(storeName + "_keys", JSON.stringify(storeKeysAry)).write();
            }
        } else {
            let storeKeysMap = new Map();
            storeKeysMap.set(key, true);
            this.m_mapStoreKeys.set(storeName, storeKeysMap);
            let storeNamesAry = this.getKeyAryFromMap(this.m_mapStoreKeys);
            await db.set("StorageService_storeNames", JSON.stringify(storeNamesAry)).write();
            let storeKeysAry = this.getKeyAryFromMap(storeKeysMap);
            await db.set(storeName + "_keys", JSON.stringify(storeKeysAry)).write();
        }
        await db.set(storeName + "_" + key, JSON.stringify(val)).write();
    }

    async delete(storeName, key) {
        if (!this.m_mapStoreKeys.has(storeName)) {
            return;
        }
        let storeKeysMap = this.m_mapStoreKeys.get(storeName);
        if (!storeKeysMap.has(key)) {
            return;
        }
        await db.unset(storeName + "_" + key).write();
        storeKeysMap.delete(key);
        let storeKeysAry = this.getKeyAryFromMap(storeKeysMap);
        if (storeKeysAry.length > 0) {
            await db.set(storeName + "_keys", JSON.stringify(storeKeysAry)).write();
        } else {
            await db.unset(storeName + "_keys").write();
            this.m_mapStoreKeys.delete(storeName);
            let storeNamesAry = this.getKeyAryFromMap(this.m_mapStoreKeys);
            if (storeNamesAry.length > 0) {
                await db.set("StorageService_storeNames", JSON.stringify(storeNamesAry)).write();
            }
            else {
                await db.unset("StorageService_storeNames").write();
            }
        }
    }

    getKeyAryFromMap(paraMap) {
        let ary = [];
        for (let [key, val] of paraMap) {
            ary.push(key);
        }
        return ary;
    }

    getCacheData(name, json2obj = true) {
      if (typeof(window) !== "undefined") {
        let data = window.localStorage.getItem(name);
        if (data) {
          if (json2obj) {
            data = JSON.parse(data)
          }
          return data;
        }
      }
      return null;
    }

    setCacheData(name, data) {
      if (typeof(window) !== "undefined") {
        if (typeof(data) !== "string") {
          data = JSON.stringify(data);
        }
        window.localStorage.setItem(name, data);
      }
    }

    getAssetLogos() {
      if (typeof(window) !== "undefined") {
        let data = window.localStorage.getItem("AssetLogo");
        if (data) {
          return JSON.parse(data);
        }
      }
      return null;
    }

    setAssetLogos(data) {
      if (typeof(window) !== "undefined") {
        window.localStorage.setItem("AssetLogo", JSON.stringify(data));
      }
    }
};

module.exports = StorageService;

