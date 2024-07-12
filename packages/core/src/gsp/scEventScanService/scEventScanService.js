"use strict";

const CheckScEvent = require("./checkScEvent");
const CheckBtcTx = require("./checkBtcTx");
const CheckXrpTx = require("./checkXrpTx");
const CheckApiServerTx = require("./checkApiServerTx");

module.exports = class ScEventScanService {
  constructor() {
  }

  async init(frameworkService) {
    this.m_frameworkService = frameworkService;
    this.m_configService = frameworkService.getService("ConfigService");
    this.chainInfoService = frameworkService.getService("ChainInfoService");

    this.m_mapCheckHandle = new Map();

    let chainsInfo = this.m_configService.getGlobalConfig("StoremanService");
    let algoExtension = this.m_configService.getExtension("ALGO");
    let algoInfo = this.chainInfoService.getChainInfoByType("ALGO");
    if (algoExtension && algoInfo) {
      chainsInfo.push(algoInfo);
    }
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

    let checkDotTx = new CheckApiServerTx(this.m_frameworkService, "DOT");
    await checkDotTx.init();
    this.m_mapCheckHandle.set("DOT", checkDotTx);

    let checkPhaTx = new CheckApiServerTx(this.m_frameworkService, "PHA");
    await checkPhaTx.init();
    this.m_mapCheckHandle.set("PHA", checkPhaTx);

    let checkAdaTx = new CheckApiServerTx(this.m_frameworkService, "ADA");
    await checkAdaTx.init();
    this.m_mapCheckHandle.set("ADA", checkAdaTx);

    let checkAtomTx = new CheckApiServerTx(this.m_frameworkService, "ATOM");
    await checkAtomTx.init();
    this.m_mapCheckHandle.set("ATOM", checkAtomTx);

    let checkNobleTx = new CheckApiServerTx(this.m_frameworkService, "NOBLE");
    await checkNobleTx.init();
    this.m_mapCheckHandle.set("NOBLE", checkNobleTx);

    let checkSolTx = new CheckApiServerTx(this.m_frameworkService, "SOL");
    await checkSolTx.init();
    this.m_mapCheckHandle.set("SOL", checkSolTx);
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

