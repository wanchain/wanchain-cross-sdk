const EventEmitter = require('events').EventEmitter;
const CrossChainTaskRecords = require('./stores/CrossChainTaskRecords');
const AccountRecords = require('./stores/AccountRecords');
const AssetPairs = require('./stores/AssetPairs');
const CrossChainTaskSteps = require('./stores/CrossChainTaskSteps');
const StartService = require('../gsp/startService/startService.js');
const BridgeTask = require('./bridgeTask.js');
const tool = require('../utils/commonTool.js');

class WanBridge extends EventEmitter {
  constructor(network = "testnet", smgIndex = 0) { // smgIndex is for testing only
    super();
    this.network = (network == "mainnet")? "mainnet" : "testnet";
    this.smgIndex = smgIndex;
    this.service = new StartService();
    this.stores = {
      crossChainTaskRecords: new CrossChainTaskRecords(),
      accountRecords: new AccountRecords(),
      assetPairs: new AssetPairs(),
      crossChainTaskSteps: new CrossChainTaskSteps()
    };
  }

  async init(iwanAuth) {
    console.log("init WanBridge SDK");
    await this.service.init(this.network, this.stores, iwanAuth);
    this.accountSrv = this.service.getService("AccountService");
    this.eventService = this.service.getService("EventService");
    this.configService = this.service.getService("ConfigService");
    this.storemanService = this.service.getService("StoremanService");
    this.storageService = this.service.getService("StorageService");
    this.feesService = this.service.getService("CrossChainFeesService");
    this.chainInfoService = this.service.getService("ChainInfoService");
    this.eventService.addEventListener("ReadStoremanInfoComplete", this.onStoremanInitilized.bind(this));
    this.eventService.addEventListener("LockTxHash", this.onLockTxHash.bind(this));
    this.eventService.addEventListener("RedeemTxHash", this.onRedeemTxHash.bind(this));
    this.eventService.addEventListener("networkFee", this.onNetworkFee.bind(this));
    this.eventService.addEventListener("AccountChanged", this.onAccountChanged.bind(this));
    await this.service.start();
  }

  onStoremanInitilized(success) {
    if (success) {
      this.emit("ready", this.stores.assetPairs.assetPairList);
    } else {
      this.emit("error", {reason: "Failed to initialize storeman"});
    }
    console.log("assetPairList: %O", this.stores.assetPairs.assetPairList);
  }

  onAccountChanged(info) {
    this.emit("account", info);
  }

  onLockTxHash(taskLockHash) {
    console.log("onLockTxHash: %O", taskLockHash);
    let records = this.stores.crossChainTaskRecords;
    let taskId = taskLockHash.ccTaskId;
    let txHash = taskLockHash.txhash;
    let value = taskLockHash.sentAmount;
    let ccTask = records.ccTaskRecords.get(taskId);
    if (!ccTask){
      return;
    }
    if (parseFloat(ccTask.networkFee) >= parseFloat(value)) {
      records.modifyTradeTaskStatus(taskId, "Failed");
    }else{
      records.modifyTradeTaskStatus(taskId, "Converting");
    }
    records.setTaskSentAmount(taskId, value);
    records.setTaskLockTxHash(taskId, txHash);
    this.storageService.save("crossChainTaskRecords", taskId, ccTask);
    this.emit("lock", {taskId, txHash});
  }

  onRedeemTxHash(taskRedeemHash) {
    console.log("onRedeemTxHash: %O", taskRedeemHash);
    let records = this.stores.crossChainTaskRecords;
    let taskId = taskRedeemHash.ccTaskId;
    let txHash = taskRedeemHash.txhash;
    let ccTask = records.ccTaskRecords.get(taskId);
    if (!ccTask){
      return;
    }
    let toAccountType = ccTask.toChainType;
    let txResult = "Succeeded";
    if ("XRP" == toAccountType) {
      if (ccTask.toAccount != taskRedeemHash.xrpAddr) {
        console.error("xrp received account %s is not match toAccount %s", taskRedeemHash.xrpAddr, ccTask.toAccount);
        txResult = "Error";
       } else {
        console.log("xrp received account %s is the same with toAccount %s", taskRedeemHash.xrpAddr, ccTask.toAccount);
      }
    }
    records.modifyTradeTaskStatus(taskId, txResult);
    records.setTaskRedeemTxHash(taskId, txHash);
    this.storageService.save("crossChainTaskRecords", taskId, ccTask);
    this.emit("redeem", {taskId, txHash});
  }

  onNetworkFee(taskNetworkFee) {
    console.log("onNetworkFee: %O", taskNetworkFee);
    let records = this.stores.crossChainTaskRecords;
    let ccTaskId = taskNetworkFee.ccTaskId;
    let networkFee = taskNetworkFee.apiServerNetworkFee;
    let ccTask = records.ccTaskRecords.get(ccTaskId);
    if (ccTask) {
      records.setTaskNetworkFee(ccTaskId, networkFee);
      this.storageService.save("crossChainTaskRecords", ccTaskId, ccTask);
    }
  }

  async connectMetaMask() {
    return this.accountSrv.connectMetaMask();
  }

  async connectPolkadot() {
    return this.accountSrv.connectPolkadot();
  }

  isReady() {
    return this.stores.assetPairs.isReady();
  }

  unifyDirection(direction) {
    direction = direction.toUpperCase();
    if (!["MINT", "BURN"].includes(direction)) {
      throw "Invalid direction, must be MINT or BURN";
    }
    return direction;
  }

  async createTask(assetPair, direction, amount, fromAccount, toAccount = "") {
    direction = this.unifyDirection(direction);
    let fromChainType = (direction == "MINT")? assetPair.fromChainType : assetPair.toChainType;
    if (fromAccount) {
      let tmpDirection = (direction == "MINT")? "BURN" : "MINT";
      if (!this.validateToAccount(assetPair, tmpDirection, fromAccount)) {
        throw "Invalid fromAccount";
      }
    } else if (!["BTC", "LTC", "XRP"].includes(fromChainType)) {
      throw "Missing fromAccount";
    } else {
      fromAccount = "";
    }
    toAccount = toAccount || fromAccount;
    if (toAccount && this.validateToAccount(assetPair, direction, toAccount)) {
      let task = new BridgeTask(this, assetPair, direction, fromAccount, toAccount, amount);
      await task.init();
      task.start();
      return task;
    } else {
      throw "Invalid toAccount";
    }
  }

  checkWallet(assetPair, direction) {
    direction = this.unifyDirection(direction);
    let chainType = (direction == "MINT")? assetPair.fromChainType : assetPair.toChainType;
    let chainInfo = this.chainInfoService.getChainInfoByType(chainType);
    if (chainInfo.MaskChainId) {
      let walletChainId = this.accountSrv.getChainId(chainType);
      return (chainInfo.MaskChainId == walletChainId);
    } else {
      return true;
    }
  }

  getWalletAccount(assetPair, direction) {
    direction = this.unifyDirection(direction);
    if (this.checkWallet(assetPair, direction)) {
      return this.stores.accountRecords.getCurAccount(assetPair.fromChainType, assetPair.toChainType, direction);
    } else {
      throw "Invalid wallet";
    }
  }

  async getAccountAsset(assetPair, direction, account) {
    direction = this.unifyDirection(direction);
    let balance = await this.storemanService.getAccountBalance(assetPair.assetPairId, direction, account, false);
    return parseFloat(balance);
  };

  async estimateFee(assetPair, direction) {
    direction = this.unifyDirection(direction);
    let operateFee = await this.feesService.getServcieFees(assetPair.assetPairId, direction);
    let networkFee = await this.feesService.estimateNetworkFee(assetPair.assetPairId, direction);
    let operateFeeValue = '', operateFeeUnit = '', networkFeeValue = '', networkFeeUnit = '';
    if (direction == 'MINT') {
      operateFeeValue = parseFloat(operateFee.mintFee);
      operateFeeUnit = assetPair.fromChainType;
      networkFeeValue = parseFloat(networkFee.mintFee);
      networkFeeUnit = assetPair.fromChainType;
    } else {
      operateFeeValue = parseFloat(operateFee.burnFee);
      operateFeeUnit = assetPair.toChainType;
      networkFeeValue = parseFloat(networkFee.burnFee);
      networkFeeUnit = assetPair.fromChainType;
    }
    return {operateFee: {value: operateFeeValue, unit: operateFeeUnit}, networkFee: {value: networkFeeValue, unit: networkFeeUnit}};
  }

  async getQuota(assetPair, direction) {
    direction = this.unifyDirection(direction);
    let fromChainType = (direction == "MINT")? assetPair.fromChainType : assetPair.toChainType;
    return this.storemanService.getStroremanGroupQuotaInfo(fromChainType, assetPair.assetPairId, assetPair.smgs[this.smgIndex % assetPair.smgs.length].id);
  }

  validateToAccount(assetPair, direction, account) {
    direction = this.unifyDirection(direction);
    let chainType = (direction == "MINT")? assetPair.toChainType : assetPair.fromChainType;
    if (["ETH", "BNB", "AVAX", "DEV", "MATIC"].includes(chainType)) {
      return tool.isValidEthAddress(account);
    } else if ("WAN" == chainType) {
      return tool.isValidWanAddress(account);
    } else if ("BTC" == chainType) {
      return tool.isValidBtcAddress(account, this.network);
    } else if ("XRP" == chainType) {
      return tool.isValidXrpAddress(account);
    } else if ("LTC" == chainType) {
      return tool.isValidLtcAddress(account, this.network);
    } else if ("DOT" == chainType) {
      // PLAN: adapted to polka app
      return tool.isValidDotAddress(account, this.network);
    } else {
      console.log("unsupported chain %s", chainType);
      return false;
    }
  }

  getHistory(taskId = undefined) {
    let history = [];
    let records = this.stores.crossChainTaskRecords;
    records.ccTaskRecords.forEach((task, id) => {
      if ((taskId == undefined) || (taskId == id)) {
        let item = {
          taskId: task.ccTaskId,
          pairId: task.assetPairId,
          timestamp: task.ccTaskId,
          asset: task.assetType,
          direction: task.convertType,
          fromSymbol: task.fromSymbol,
          toSymbol: task.toSymbol,          
          fromChain: task.fromChainName,
          toChain: task.toChainName,
          amount: task.sentAmount || task.amount,
          fee: task.fee,
          fromAccount: task.fromAccount,
          toAccount: task.toAccount,
          ota: task.ota,
          lockHash: task.lockHash,
          redeemHash: task.redeemHash,
          status: task.status
        }
        history.push(item);
      }
    });
    return history;
  }
}

module.exports = WanBridge;