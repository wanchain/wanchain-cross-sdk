"use strict";

let FrameworkService = require("../frameworkService/FrameworkService");
let EventService = require("../eventService/EventService");
let ConfigService = require("../configService/configService");

let CheckiWanSpeed = require("../checkiWanSpeedService/checkiWanSpeed");
let IWanBCConnector = require("../iWanConnectorService/IWanBCConnector");

let StorageService = require("../storageService/storageService");

let TaskService = require("../taskService/TaskService");

let StoremanService = require("../storemanService/StoremanService");
let TxGeneratorService = require("../txGeneratorService/TxGeneratorService");
let CheckTxReceiptService = require("../checkTxReceiptService/checkTxReceiptService");

let CheckBtcTxService = require("../checkBtcTxService/checkBtcTxService");
let CheckXrpTxService = require("../checkXrpTxService/checkXrpTxService");

let UIStrService = require("../uiStrService/uiStrService");
let ScEventScanService = require("../scEventScanService/scEventScanService");
let UtilService = require("../utilService/utilService");
let CrossChainFeesService = require("../crossChainFeesService/crossChainFees");

let CCTHandleService = require("../CCTHandleService/CCTHandleService");
let TxTaskHandleService = require("../txTaskHandleService/txTaskHandleService");
let TokenPairService = require("../tokenPairService/tokenPairService");
let ChainInfoService = require("../chainInfoService/chainInfoService");

const GlobalConstant = require("../globalConstantService/globalConstant");

let CheckDotTxService = require("../checkDotTxService/checkDotTxService");
let CheckAdaTxService = require("../checkAdaTxService/checkAdaTxService");

class StartService {
    constructor(isTestMode) {
        this.isTestMode = isTestMode;
        this.frameworkService = new FrameworkService();
    }

    async onIwanConnected() {
        console.log("StartService onIwanConnected");
    }

    async onStoremanServiceInitComplete(args) {
        this.m_eventService.emitEvent("ReadStoremanInfoComplete", args);
        //console.log("StartService onStoremanServiceInitComplete args: ", args);
    }

    async init(network, stores, iwanAuth) {
        try {
            let frameworkService = this.frameworkService;
            frameworkService.registerService("WebStores", stores);

            frameworkService.registerService("GlobalConstant", GlobalConstant);

            let utilService = new UtilService();
            await utilService.init(frameworkService);
            frameworkService.registerService("UtilService", utilService);

            let eventService = new EventService();
            await eventService.init(frameworkService);
            frameworkService.registerService("EventService", eventService);
            // eventService.addEventListener("iwanConnected", this.onIwanConnected.bind(this));
            eventService.addEventListener("StoremanServiceInitComplete", this.onStoremanServiceInitComplete.bind(this));
            this.m_eventService = eventService;

            let configService = new ConfigService();
            await configService.init(network);
            frameworkService.registerService("ConfigService", configService);

            let chainInfoService = new ChainInfoService();
            await chainInfoService.init(frameworkService);
            frameworkService.registerService("ChainInfoService", chainInfoService);

            let cctHandleService = new CCTHandleService();
            await cctHandleService.init(frameworkService);
            frameworkService.registerService("CCTHandleService", cctHandleService);

            let txTaskHandleService = new TxTaskHandleService();
            await txTaskHandleService.init(frameworkService);
            frameworkService.registerService("TxTaskHandleService", txTaskHandleService);

            let taskService = new TaskService();
            await taskService.init(frameworkService);
            frameworkService.registerService("TaskService", taskService);

            let uiStrService = new UIStrService();
            await uiStrService.init(frameworkService);
            frameworkService.registerService("UIStrService", uiStrService);

            let checkiwanSpeed = new CheckiWanSpeed();
            await checkiwanSpeed.init(frameworkService);
            frameworkService.registerService("CheckiWanSpeed", checkiwanSpeed);

            let iWanOption = await configService.getConfig("iWanConnectorService", "iWanOption");
            Object.assign(iWanOption, iwanAuth);
            let iwanBCConnector = new IWanBCConnector(iWanOption);
            await iwanBCConnector.init(frameworkService);
            frameworkService.registerService("iWanConnectorService", iwanBCConnector);

            let checkDotTxService = new CheckDotTxService("DOT");
            await checkDotTxService.init(frameworkService);
            frameworkService.registerService("CheckDotTxService", checkDotTxService);

            let checkPhaTxService = new CheckDotTxService("PHA");
            await checkPhaTxService.init(frameworkService);
            frameworkService.registerService("CheckPhaTxService", checkPhaTxService);

            let checkAdaTxService = new CheckAdaTxService();
            await checkAdaTxService.init(frameworkService);
            frameworkService.registerService("CheckAdaTxService", checkAdaTxService);            

            let storemanService = new StoremanService();
            await storemanService.init(frameworkService);
            frameworkService.registerService("StoremanService", storemanService);

            let tokenPairService = new TokenPairService(this.isTestMode);
            await tokenPairService.init(frameworkService);
            frameworkService.registerService("TokenPairService", tokenPairService);

            let txGeneratorService = new TxGeneratorService();
            await txGeneratorService.init(frameworkService);
            frameworkService.registerService("TxGeneratorService", txGeneratorService);

            let checkTxReceiptService = new CheckTxReceiptService();
            await checkTxReceiptService.init(frameworkService);
            frameworkService.registerService("CheckTxReceiptService", checkTxReceiptService);

            let checkBtcTxService = new CheckBtcTxService("BTC");
            await checkBtcTxService.init(frameworkService);
            frameworkService.registerService("CheckBtcTxService", checkBtcTxService);

            let checkLtcTxService = new CheckBtcTxService("LTC");
            await checkLtcTxService.init(frameworkService);
            frameworkService.registerService("CheckLtcTxService", checkLtcTxService);

            let checkDogeTxService = new CheckBtcTxService("DOGE");
            await checkDogeTxService.init(frameworkService);
            frameworkService.registerService("CheckDogeTxService", checkDogeTxService);

            let checkXrpTxService = new CheckXrpTxService();
            await checkXrpTxService.init(frameworkService);
            frameworkService.registerService("CheckXrpTxService", checkXrpTxService);

            let scEventScanService = new ScEventScanService();
            await scEventScanService.init(frameworkService);
            frameworkService.registerService("ScEventScanService", scEventScanService);

            let storageService = new StorageService();
            await storageService.init(frameworkService);
            frameworkService.registerService("StorageService", storageService);

            let crossChainFeesService = new CrossChainFeesService();
            await crossChainFeesService.init(frameworkService);
            frameworkService.registerService("CrossChainFeesService", crossChainFeesService);
        }
        catch (err) {
            console.log("StartService.init err:", err);
        }
    }

    async start() {
        try {
            let frameworkService = this.frameworkService;

            let storageService = frameworkService.getService("StorageService");
            await storageService.init_load();

            let checkTxReceiptService = frameworkService.getService("CheckTxReceiptService");
            await checkTxReceiptService.start();

            let checkBtcTxService = frameworkService.getService("CheckBtcTxService");
            await checkBtcTxService.start();

            let checkLtcTxService = frameworkService.getService("CheckLtcTxService");
            await checkLtcTxService.start();

            let checkDogeTxService = frameworkService.getService("CheckDogeTxService");
            await checkDogeTxService.start();            

            let checkXrpTxService = frameworkService.getService("CheckXrpTxService");
            await checkXrpTxService.start();

            let checkDotTxService = frameworkService.getService("CheckDotTxService");
            await checkDotTxService.start();

            let checkPhaTxService = frameworkService.getService("CheckPhaTxService");
            await checkPhaTxService.start();

            let checkAdaTxService = frameworkService.getService("CheckAdaTxService");
            await checkAdaTxService.start();            
        } catch (err) {
            console.error("startService start err:", err);
        }
    }

    getService(serviceName) {
        return this.frameworkService.getService(serviceName);
    }
};

module.exports = StartService;
