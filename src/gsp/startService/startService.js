"use strict";

let FrameworkService = require("../frameworkService/FrameworkService");
let EventService = require("../eventService/EventService");
let ConfigService = require("../configService/configService");

let CheckiWanSpeed = require("../checkiWanSpeedService/checkiWanSpeed");
let IWanBCConnector = require("../iWanConnectorService/IWanBCConnector");

let StorageService = require("../storageService/storageService");
let AccountService = require("../accountService/AccountService");

let TaskService = require("../taskService/TaskService");
let MetaMaskService = require("../metaMaskService/MetaMaskService");

let StoremanService = require("../storemanService/StoremanService");
let TxGeneratorService = require("../txGeneratorService/TxGeneratorService");
let CheckTxReceiptService = require("../checkTxReceiptService/checkTxReceiptService");

let CheckBtcTxService = require("../checkBtcTxService/checkBtcTxService");
let CheckXrpTxService = require("../checkXrpTxService/checkXrpTxService");
let CheckLtcTxService = require("../checkLtcTxService/checkLtcTxService");

let UIStrService = require("../uiStrService/uiStrService");
let ScEventScanService = require("../scEventScanService/scEventScanService");
let UtilService = require("../utilService/utilService");
let CrossChainFeesService = require("../crossChainFeesService/crossChainFees");

let XrpService = require("../xrpService/xrpService");
let BtcService = require("../btcService/btcService");
let LtcService = require("../ltcService/ltcService");
let EosService = require("../eosService/eosService");

let CCTHandleService = require("../CCTHandleService/CCTHandleService");
let TxTaskHandleService = require("../txTaskHandleService/txTaskHandleService");
let TokenPairService = require("../tokenPairService/tokenPairService");
let ChainInfoService = require("../chainInfoService/chainInfoService");

const GlobalConstant = require("../globalConstantService/globalConstant");

let PolkadotMaskService = require("../polkadotMaskService/polkadotMaskService");
let CheckDotTxService = require("../checkDotTxService/checkDotTxService");

class StartService {
    constructor() {
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

            let metaMaskService = new MetaMaskService();
            await metaMaskService.init(frameworkService);
            frameworkService.registerService("MetaMaskService", metaMaskService);

            let polkadotMaskService = new PolkadotMaskService();
            await polkadotMaskService.init(frameworkService);
            frameworkService.registerService("PolkadotMaskService", polkadotMaskService);

            let accountService = new AccountService();
            await accountService.init(frameworkService);
            frameworkService.registerService("AccountService", accountService);

            let xrpService = new XrpService();
            await xrpService.init(frameworkService);
            frameworkService.registerService("XrpService", xrpService);

            let btcService = new BtcService();
            await btcService.init(frameworkService);
            frameworkService.registerService("BtcService", btcService);

            let ltcService = new LtcService();
            await ltcService.init(frameworkService);
            frameworkService.registerService("LtcService", ltcService);

            let eosService = new EosService();
            await eosService.init(frameworkService);
            frameworkService.registerService("EosService", eosService);

            let checkDotTxService = new CheckDotTxService();
            await checkDotTxService.init(frameworkService);
            frameworkService.registerService("CheckDotTxService", checkDotTxService);

            let storemanService = new StoremanService();
            await storemanService.init(frameworkService);
            frameworkService.registerService("StoremanService", storemanService);

            let tokenPairService = new TokenPairService();
            await tokenPairService.init(frameworkService);
            frameworkService.registerService("TokenPairService", tokenPairService);

            let txGeneratorService = new TxGeneratorService();
            await txGeneratorService.init(frameworkService);
            frameworkService.registerService("TxGeneratorService", txGeneratorService);

            let checkTxReceiptService = new CheckTxReceiptService();
            await checkTxReceiptService.init(frameworkService);
            frameworkService.registerService("CheckTxReceiptService", checkTxReceiptService);

            let checkBtcTxService = new CheckBtcTxService();
            await checkBtcTxService.init(frameworkService);
            frameworkService.registerService("CheckBtcTxService", checkBtcTxService);

            let checkLtcTxService = new CheckLtcTxService();
            await checkLtcTxService.init(frameworkService);
            frameworkService.registerService("CheckLtcTxService", checkLtcTxService);

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

            //{
            //    // only for test
            //    let chainType = "ETH";
            //    let chainAddr = "0xeb195290a199F78d184B02BbF71fA6460371fcfC";
            //    let storemanGroupPublic = "02b3a6e024cd7949510d0a491eec36104d89ba4d6c063d40563de02c674e1f0929";
            //    let ret = await btcService.generateOnetimeAddress(chainType, chainAddr, storemanGroupPublic);
            //    console.log("startService ota:", ret);
            //    await btcService.confirmOnetimeAddress(ret.address);

            //    ret = await xrpService.getTagId("xrpAddr", "WAN", "chainAddr", "storemanGroupPublic");
            //    await xrpService.confirmTagId(ret.tagId);
            //}
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

            let checkXrpTxService = frameworkService.getService("CheckXrpTxService");
            await checkXrpTxService.start();

            let checkDotTxService = frameworkService.getService("CheckDotTxService");
            await checkDotTxService.start();
        }
        catch (err) {
            console.log("startService start err:", err);
        }
    }

    getService(serviceName) {
        return this.frameworkService.getService(serviceName);
    }
};

module.exports = StartService;
