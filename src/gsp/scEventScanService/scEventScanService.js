"use strict";

let CheckScEvent = require("./checkScEvent");
let CheckBtcTx = require("./checkBtcTx");
let CheckXrpTx = require("./checkXrpTx");

module.exports = class ScEventScanService {
    constructor() {
    }

    async init(frameworkService) {
        this.m_frameworkService = frameworkService;
        this.m_configService = frameworkService.getService("ConfigService");

        this.m_mapCheckHandle = new Map();

        let wanInfo = await this.m_configService.getConfig("StoremanService", "WanInfo");
        wanInfo.ScScanInfo = await this.m_configService.getConfig("ScEventScanService", "WANScScanInfo");
        this.m_wanCheckScEvent = new CheckScEvent(this.m_frameworkService);
        this.m_wanCheckScEvent.init(wanInfo);
        this.m_mapCheckHandle.set("WAN", this.m_wanCheckScEvent);

        let ethInfo = await this.m_configService.getConfig("StoremanService", "EthInfo");
        ethInfo.ScScanInfo = await this.m_configService.getConfig("ScEventScanService", "ETHScScanInfo");
        this.m_ethCheckScEvent = new CheckScEvent(this.m_frameworkService);
        this.m_ethCheckScEvent.init(ethInfo);
        this.m_mapCheckHandle.set("ETH", this.m_ethCheckScEvent);

        let bscInfo = await this.m_configService.getConfig("StoremanService", "BscInfo");
        bscInfo.ScScanInfo = await this.m_configService.getConfig("ScEventScanService", "BSCScScanInfo");
        this.m_bscCheckScEvent = new CheckScEvent(this.m_frameworkService);
        this.m_bscCheckScEvent.init(bscInfo);
        this.m_mapCheckHandle.set("BNB", this.m_bscCheckScEvent);

        let checkBtcTx = new CheckBtcTx(this.m_frameworkService);
        await checkBtcTx.init();
        this.m_mapCheckHandle.set("BTC", checkBtcTx);

        let checkXrpTx = new CheckXrpTx(this.m_frameworkService);
        await checkXrpTx.init();
        this.m_mapCheckHandle.set("XRP", checkXrpTx);
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
        }
    }
};

