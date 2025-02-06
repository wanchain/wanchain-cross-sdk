"use strict";

const CheckScEvent = require("./checkScEvent");
const CheckBtcTx = require("./checkBtcTx");
const CheckXrpTx = require("./checkXrpTx");
const CheckApiServerTx = require("./checkApiServerTx");
const CheckSuiTx = require("./checkSuiTx");

module.exports = class ScEventScanService {
  constructor() {
  }

  async init(frameworkService) {
    this.frameworkService = frameworkService;
    this.configService = frameworkService.getService("ConfigService");
    this.chainInfoService = frameworkService.getService("ChainInfoService");

    this.mapCheckHandle = new Map();

    // evm event add similar chains
    let eventChains = this.configService.getGlobalConfig("StoremanService");
    let nonEvmChains = ["ALGO"];
    for (let chain of nonEvmChains) {
      let extension = this.configService.getExtension(chain);
      let info = this.chainInfoService.getChainInfoByType(chain);
      if (extension && info) {
        eventChains = eventChains.concat(info);
      }
    };
    for (let chain of eventChains) {
      let checkScEvent = new CheckScEvent(frameworkService);
      checkScEvent.init(chain);
      this.mapCheckHandle.set(chain.chainType, checkScEvent);
    };

    // apiServer chains
    let apiServerChains = ["DOT", "PHA", "ADA", "ATOM", "NOBLE", "KAVA", "SOL", "TON"];
    for (let chain of apiServerChains) {
      let extension = this.configService.getExtension(chain);
      let info = this.chainInfoService.getChainInfoByType(chain);
      if (extension && info) {
        let checkTx = new CheckApiServerTx(frameworkService, chain);
        await checkTx.init();
        this.mapCheckHandle.set(chain, checkTx);
      }
    }

    // BTC series chains
    let checkBtcTx = new CheckBtcTx(frameworkService, "BTC");
    await checkBtcTx.init();
    this.mapCheckHandle.set("BTC", checkBtcTx);

    let checkLtcTx = new CheckBtcTx(frameworkService, "LTC");
    await checkLtcTx.init();
    this.mapCheckHandle.set("LTC", checkLtcTx);

    let checkDogeTx = new CheckBtcTx(frameworkService, "DOGE");
    await checkDogeTx.init();
    this.mapCheckHandle.set("DOGE", checkDogeTx);

    // other dedicated chains
    let checkXrpTx = new CheckXrpTx(frameworkService);
    await checkXrpTx.init("XRP");
    this.mapCheckHandle.set("XRP", checkXrpTx);
  
    let extension = this.configService.getExtension("SUI");
    let info = this.chainInfoService.getChainInfoByType("SUI");
    if (extension && info) {
      let checkSuiTx = new CheckSuiTx(frameworkService);
      await checkSuiTx.init(info);
      this.mapCheckHandle.set("SUI", checkSuiTx);
    }
  }

  async loadTradeTask(tasks) {
    try {
      for (let task of tasks) {
        await this.load(task)
      }
    } catch (err) {
      console.log("ScEventScanService loadTradeTask error: %O", err);
    }
  }

  async add(task) {
    //console.log("scEventScanService add task: %O", task);
    let storageService = this.frameworkService.getService("StorageService");
    await storageService.save("ScEventScanService", task.uniqueID, task);
    let handle = this.mapCheckHandle.get(task.chain);
    if (handle) {
      await handle.add(task);
    }
  }

  async load(task) {
    //console.log("scEventScanService load task: %O", task);
    let handle = this.mapCheckHandle.get(task.chain);
    if (handle) {
      await handle.load(task);
    } else {
      console.error("ScEventScan for %s unavailable", task.chain);
    }
  }
};

