"use strict";

var _ = require('lodash');

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
        //await this.init_load();
    }

    async init_load() {
        this.m_mapStoreKeys.clear();
        let storeNamesStr = window.localStorage.getItem("StorageService_storeNames");
        if (storeNamesStr) {
            let storeNamesAry = JSON.parse(storeNamesStr);
            for (let idx = 0; idx < storeNamesAry.length; ++idx) {
                let storeName = storeNamesAry[idx];
                let key = storeName + "_keys";
                let storeKeysStr = window.localStorage.getItem(key);
                if (storeKeysStr) {
                    try {
                        let storeKeysAry = JSON.parse(storeKeysStr);
                        let valueAry = [];
                        let storeKeysMap = new Map();
                        for (let storeKeyIdx = 0; storeKeyIdx < storeKeysAry.length; ++storeKeyIdx) {
                            try {
                                let keyName = storeKeysAry[storeKeyIdx];
                                key = storeName + "_" + keyName;
                                let value = window.localStorage.getItem(key);
                                valueAry.push(JSON.parse(value));
                                storeKeysMap.set(keyName, true);
                            }
                            catch (err) {
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
                        }
                        catch (err) {
                            console.log("init_load 2 err:", err);
                        }
                    }
                    catch (err) {
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
                window.localStorage.setItem(storeName + "_keys", JSON.stringify(storeKeysAry));
            }
        }
        else {
            let storeKeysMap = new Map();
            storeKeysMap.set(key, true);
            this.m_mapStoreKeys.set(storeName, storeKeysMap);
            let storeNamesAry = this.getKeyAryFromMap(this.m_mapStoreKeys);
            window.localStorage.setItem("StorageService_storeNames", JSON.stringify(storeNamesAry));

            let storeKeysAry = this.getKeyAryFromMap(storeKeysMap);
            window.localStorage.setItem(storeName + "_keys", JSON.stringify(storeKeysAry));
        }
        window.localStorage.setItem(storeName + "_" + key, JSON.stringify(val));
    }

    async delete(storeName, key) {
        if (!this.m_mapStoreKeys.has(storeName)) {
            return;
        }

        let storeKeysMap = this.m_mapStoreKeys.get(storeName);
        if (!storeKeysMap.has(key)) {
            return;
        }

        window.localStorage.removeItem(storeName + "_" + key);
        storeKeysMap.delete(key);

        let storeKeysAry = this.getKeyAryFromMap(storeKeysMap);
        if (storeKeysAry.length > 0) {
            window.localStorage.setItem(storeName + "_keys", JSON.stringify(storeKeysAry));
        }
        else {
            window.localStorage.removeItem(storeName + "_keys");
            this.m_mapStoreKeys.delete(storeName);
            let storeNamesAry = this.getKeyAryFromMap(this.m_mapStoreKeys);
            if (storeNamesAry.length > 0) {
                window.localStorage.setItem("StorageService_storeNames", JSON.stringify(storeNamesAry));
            }
            else {
                window.localStorage.removeItem("StorageService_storeNames");
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
};

module.exports = StorageService;

