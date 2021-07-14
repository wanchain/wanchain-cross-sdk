const EventEmitter = require('events').EventEmitter;
const CrossChainTaskRecords = require('./stores/CrossChainTaskRecords');
const AccountRecords = require('./stores/AccountRecords');
const AssetPairs = require('./stores/AssetPairs');
const CrossChainTaskSteps = require('./stores/CrossChainTaskSteps');
const StartService = require('../gsp/startService/startService.js');
const BridgeTask = require('./bridgeTask.js');
const tool = require('../utils/commonTool.js');

class WanBridge extends EventEmitter {
  constructor(network) {
    super();
    this.network = network;
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
    this.storemanService = this.service.getService("StoremanService");
    this.storageService = this.service.getService("StorageService");
    this.feesService = this.service.getService("CrossChainFeesService");
    this.chainInfoService = this.service.getService("ChainInfoService");
    this.eventService.addEventListener("ReadStoremanInfoComplete", this.onStoremanInitilized.bind(this));
    this.eventService.addEventListener("ModifyTradeTaskStatus", this.onModifyTradeTaskStatus.bind(this));
    this.eventService.addEventListener("LockTxHash", this.onLockTxHash.bind(this));
    this.eventService.addEventListener("RedeemTxHash", this.onRedeemTxHash.bind(this));
    this.eventService.addEventListener("networkFee", this.onTaskNetworkFee.bind(this));
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

  onModifyTradeTaskStatus(taskId) {
    console.log("onModifyTradeTaskStatus taskId %s", taskId);
    let records = this.stores.crossChainTaskRecords;
    let ccTask = records.ccTaskRecords.get(taskId);
    if (ccTask) {
      records.modifyTradeTaskStatus(taskId, 'Succeeded');
      this.storageService.save("crossChainTaskRecords", taskId, ccTask);
    }
  }

  onLockTxHash(taskLockHash) {
    console.log("onLockTxHash: %O", taskLockHash);
    let records = this.stores.crossChainTaskRecords;
    let taskId = taskLockHash.ccTaskId;
    let txHash = taskLockHash.txhash;
    let value = taskLockHash.sentAmount;
    let taskData = records.ccTaskRecords.get(taskId);
    if (!taskData){
      return;
    }
    if (parseFloat(taskData.networkFee) >= parseFloat(value)) {
      records.modifyTradeTaskStatus(taskId, "Failed");
    }else{
      records.modifyTradeTaskStatus(taskId, "Converting");
    }
    records.setTaskSentAmount(taskId, value);
    records.setTaskLockTxHash(taskId, txHash);
    this.storageService.save("crossChainTaskRecords", taskId, taskData);
    this.emit("lock", {taskId, txHash});
  }

  onRedeemTxHash(taskRedeemHash) {
    console.log("onRedeemTxHash: %O", taskRedeemHash);
    let records = this.stores.crossChainTaskRecords;
    let taskId = taskRedeemHash.ccTaskId;
    let txHash = taskRedeemHash.txhash;
    let preTask = records.ccTaskRecords.get(taskId);
    let toAccountType = preTask.toChainType;
    let txResult = "Succeeded";
    if ("XRP" == toAccountType) {
      if (preTask.destAccount != taskRedeemHash.xrpAddr) {
        console.error("xrp received account %s is not match the destination account %s ", taskRedeemHash.xrpAddr, preTask.destAccount);
        txResult = "Error";
       } else {
        console.log("xrp received account is the same with the destination address: ", taskRedeemHash.xrpAddr, preTask.destAccount);
      }
    }
    let ccTask = records.ccTaskRecords.get(taskId);
    if (ccTask) {
      records.modifyTradeTaskStatus(taskId, txResult);
      records.setTaskRedeemTxHash(taskId, txHash);
      this.storageService.save("crossChainTaskRecords", taskId, ccTask);
    }
    this.emit("redeem", {taskId, txHash});
  }

  onTaskNetworkFee(taskNetworkFee) {
    console.log("onTaskNetworkFee: %O", taskNetworkFee);
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
    return this.accountSrv.connectMask();
  }

  isReady() {
    return this.stores.assetPairs.isInitialized();
  }

  async createTask(assetPair, direction, amount, toAccount = "") {
    direction = direction.toUpperCase();
    if (!["MINT", "BURN"].includes(direction)) {
      throw "Invalid direction, must be MINT or BURN";
    }
    let to = toAccount || this.stores.accountRecords.getCurAccount(assetPair.fromChainType, assetPair.toChainType, direction);
    if (to && this.validateToAccount(assetPair, direction, to)) {
      let task = new BridgeTask(this, assetPair, direction, to, amount);
      await task.init();
      return task;
    } else {
      throw "Invalid to address";
    }
  }

  checkWallet(assetPair, direction) {
    let chainType = (direction == "MINT")? assetPair.fromChainType : assetPair.toChainType;
    let chainInfo = this.chainInfoService.getChainInfoByName(chainType);
    if (chainInfo.MaskChainId) {
      let walletChainId = this.accountSrv.getChainId();
      return (chainInfo.MaskChainId == walletChainId);
    } else {
      return true;
    }
  }

  getWalletAccount(assetPair, direction) {
    direction = direction.toUpperCase();
    if (!["MINT", "BURN"].includes(direction)) {
      throw "Invalid direction, must be MINT or BURN";
    }
    if (this.checkWallet(assetPair, direction)) {
      return this.stores.accountRecords.getCurAccount(assetPair.fromChainType, assetPair.toChainType, direction);
    } else {
      throw "Invalid wallet";
    }
  };

  async getAccountAsset(assetPair, direction, account) {
    direction = direction.toUpperCase();
    let balance = await this.storemanService.getAccountBalance(assetPair.assetPairId, direction, account, false);
    return parseFloat(balance);
  };

  async estimateFee(assetPair, direction) {
    direction = direction.toUpperCase();
    if (!["MINT", "BURN"].includes(direction)) {
      throw "Invalid direction, must be MINT or BURN";
    }
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

  validateToAccount(assetPair, direction, account) {
    direction = direction.toUpperCase();
    if (!["MINT", "BURN"].includes(direction)) {
      throw "Invalid direction, must be MINT or BURN";
    }
    let chainType = (direction == "MINT")? assetPair.toChainType : assetPair.fromChainType;
    if (["ETH", "BNB", "AVAX", "DEV", "MATIC"].includes(chainType)) {
      return tool.isValidEthAddress(account);
    } else if ("WAN" == chainType) {
      return tool.isValidWanAddress(account);
    } else if ("BTC" == chainType) {
      return tool.isValidBtcAddress(account);
    } else if ("XRP" == chainType) {
      return tool.isValidXrpAddress(account);
    } else if ("LTC" == chainType) {
      return tool.isValidLtcAddress(account);
    } else if ("DOT" == chainType) {
      // PLAN: adapted to polka app
      return tool.isValidDotAddress(account);
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
        let direction = task.convertType;
        let operateFeeUnit = (direction == 'MINT')? task.fromChainType : task.toChainType;
        let networkFeeUnit = task.fromChainType;
        let item = {
          taskId: task.ccTaskId,
          pairId: task.assetPairId,
          timestamp: task.ccTaskId,
          assert: task.assetType,
          fromChain: task.srcAsset.split('@')[1],
          toChain: task.dstAsset.split('@')[1],
          direction,
          amount: task.sentAmount || task.amount,
          fee: {operateFee: {value: task.operateFee, unit: operateFeeUnit}, networkFee: {value: task.networkFee, unit: networkFeeUnit}},
          toAddress: task.destAccount,
          ota: task.disposableAddress,
          lockHash: task.lockHash,
          redeemHash: task.redeemHash,
          status: task.status,
        }
        history.push(item);
      }
    });
    return history;
  }
}

module.exports = WanBridge;