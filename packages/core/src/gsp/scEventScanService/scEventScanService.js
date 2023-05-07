"use strict";

const CheckScEvent = require("./checkScEvent");
const CheckBtcTx = require("./checkBtcTx");
const CheckXrpTx = require("./checkXrpTx");
const CheckDotTx = require("./checkDotTx");
const CheckAdaTx = require("./checkAdaTx");

module.exports = class ScEventScanService {
  constructor() {
  }

  async init(frameworkService) {
    this.m_frameworkService = frameworkService;
    this.m_configService = frameworkService.getService("ConfigService");

    this.m_mapCheckHandle = new Map();

    let chainsInfo = this.m_configService.getGlobalConfig("StoremanService");
    // console.debug("chainInfoService chainsInfo:", chainsInfo);
    for (let idx = 0; idx < chainsInfo.length; ++idx) {
      let obj = chainsInfo[idx];
      let checkScEventObj = new CheckScEvent(this.m_frameworkService);
      checkScEventObj.init(obj);
      this.m_mapCheckHandle.set(obj.chainType, checkScEventObj);
    }

    let checkBtcTx = new CheckBtcTx(this.m_frameworkService, "BTC");
    await checkBtcTx.init();
    this.m_mapCheckHandle.set("BTC", checkBtcTx);

    let checkLtcTx = new CheckBtcTx(this.m_frameworkService, "LTC");
    await checkLtcTx.init();
    this.m_mapCheckHandle.set("LTC", checkLtcTx);

    let checkDogeTx = new CheckBtcTx(this.m_frameworkService, "DOGE");
    await checkDogeTx.init();
    this.m_mapCheckHandle.set("DOGE", checkDogeTx);

    let checkXrpTx = new CheckXrpTx(this.m_frameworkService);
    await checkXrpTx.init("XRP");
    this.m_mapCheckHandle.set("XRP", checkXrpTx);

    let checkDotTx = new CheckDotTx(this.m_frameworkService, "DOT");
    await checkDotTx.init();
    this.m_mapCheckHandle.set("DOT", checkDotTx);

    let checkPhaTx = new CheckDotTx(this.m_frameworkService, "PHA");
    await checkPhaTx.init();
    this.m_mapCheckHandle.set("PHA", checkPhaTx);

    let checkAdaTx = new CheckAdaTx(this.m_frameworkService);
    await checkAdaTx.init("ADA");
    this.m_mapCheckHandle.set("ADA", checkAdaTx);
  }

  async loadTradeTask(dataAry) {
    try {
      for (let idx = 0; idx < dataAry.length; ++idx) {
        let obj = dataAry[idx];
        await this.load(obj)
      }
    }
    catch (err) {
      console.log("ScEventScanService loadTradeTask err:", err);
    }
  }

  async add(obj) {
    //console.log("scEventScanService add obj:", obj);
    let storageService = this.m_frameworkService.getService("StorageService");
    obj.beginTime = new Date().getTime();
    await storageService.save("ScEventScanService", obj.uniqueID, obj);
    let handle = this.m_mapCheckHandle.get(obj.chain);
    if (handle) {
      await handle.add(obj);
    }
  }

  async load(obj) {
    //console.log("scEventScanService load obj:", obj);
    let handle = this.m_mapCheckHandle.get(obj.chain);
    if (handle) {
      await handle.load(obj);
    } else {
      console.error("ScEventScan for %s unavailable", obj.chain);
    }
  }
};

