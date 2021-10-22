const EventEmitter = require('events').EventEmitter;
const CrossChainTaskRecords = require('./stores/CrossChainTaskRecords');
const AssetPairs = require('./stores/AssetPairs');
const CrossChainTaskSteps = require('./stores/CrossChainTaskSteps');
const StartService = require('../gsp/startService/startService.js');
const BridgeTask = require('./bridgeTask.js');
const tool = require('../utils/tool.js');
const BigNumber = require("bignumber.js");

class WanBridge extends EventEmitter {
  constructor(network = "testnet", isTestMode = false, smgIndex = 0) { // smgIndex is for testing only
    super();
    this.network = (network == "mainnet")? "mainnet" : "testnet";
    this.isTestMode = isTestMode;
    this.smgIndex = smgIndex;
    this.stores = {
      crossChainTaskRecords: new CrossChainTaskRecords(),
      assetPairs: new AssetPairs(),
      crossChainTaskSteps: new CrossChainTaskSteps()
    };
    this._service = new StartService(isTestMode);
  }

  async init(iwanAuth) {
    console.log("init %s WanBridge SDK", this.network);
    console.debug("isTestMode: %s, smgIndex: %s", this.isTestMode, this.smgIndex);
    await this._service.init(this.network, this.stores, iwanAuth);
    this.eventService = this._service.getService("EventService");
    this.configService = this._service.getService("ConfigService");
    this.storemanService = this._service.getService("StoremanService");
    this.storageService = this._service.getService("StorageService");
    this.feesService = this._service.getService("CrossChainFeesService");
    this.chainInfoService = this._service.getService("ChainInfoService");
    this.globalConstant = this._service.getService("GlobalConstant");
    this.eventService.addEventListener("ReadStoremanInfoComplete", this._onStoremanInitilized.bind(this));
    this.eventService.addEventListener("LockTxHash", this._onLockTxHash.bind(this));
    this.eventService.addEventListener("LockTxTimeout", this._onLockTxTimeout.bind(this));
    this.eventService.addEventListener("RedeemTxHash", this._onRedeemTxHash.bind(this));
    await this._service.start();
  }

  isReady() {
    return this.stores.assetPairs.isReady();
  }

  async checkWallet(assetPair, direction, wallet) {
    direction = this._unifyDirection(direction);
    let chainType = (direction == "MINT")? assetPair.fromChainType : assetPair.toChainType;
    if (this._isThirdPartyWallet(chainType)) {
      return true;
    } else {
      let chainInfo = this.chainInfoService.getChainInfoByType(chainType);
      if (chainInfo.MaskChainId) {
        if (wallet) {
          let walletChainId = await wallet.getChainId();
          return (chainInfo.MaskChainId == walletChainId);
        } else {
          return false;
        }
      } else {
        return true;
      }
    }
  }

  async createTask(assetPair, direction, amount, fromAccount, toAccount, wallet = null) {
    console.debug("wanBridge createTask at %s ms", tool.getCurTimestamp());
    
    direction = this._unifyDirection(direction);
    let fromChainType = (direction == "MINT")? assetPair.fromChainType : assetPair.toChainType;
    // check fromAccount
    if (this._isThirdPartyWallet(fromChainType)) {
      fromAccount = "";
    } else if (fromAccount) {
      let tmpDirection = (direction == "MINT")? "BURN" : "MINT";
      if (!this.validateToAccount(assetPair, tmpDirection, fromAccount)) {
        throw "Invalid fromAccount";
      }
    } else {
      throw "Missing fromAccount";
    }
    // check toAccount
    if (!(toAccount && this.validateToAccount(assetPair, direction, toAccount))) {
      throw "Invalid toAccount";
    }
    // check wallet
    if (this._isThirdPartyWallet(fromChainType)) {
      wallet = null;
    } else if (wallet) {
      wallet = this._unifyWallet(wallet);
    } else {
      throw "Missing wallet";
    }
    // create task
    let task = new BridgeTask(this, assetPair, direction, fromAccount, toAccount, amount, wallet);
    await task.init();
    await task.start();
    return task;
  }

  cancelTask(taskId) {
    // only set the status, do not really stop the task
    let records = this.stores.crossChainTaskRecords;
    let ccTask = records.ccTaskRecords.get(taskId);
    if (!ccTask) {
      return;
    }
    records.modifyTradeTaskStatus(taskId, "Rejected");
    this.emit("error", {taskId, reason: "Rejected"});
    this.storageService.save("crossChainTaskRecords", taskId, ccTask);
  }

  async getAccountAsset(assetPair, direction, account, isCoin = false, toKeepAlive = false) {
    direction = this._unifyDirection(direction);
    let balance = await this.storemanService.getAccountBalance(assetPair.assetPairId, direction, account, isCoin, toKeepAlive);
    return balance.toFixed();
  }

  async estimateFee(assetPair, direction) {
    direction = this._unifyDirection(direction);
    let operateFee = await this.feesService.getServcieFees(assetPair.assetPairId, direction);
    let networkFee = await this.feesService.estimateNetworkFee(assetPair.assetPairId, direction);
    let operateFeeValue = '', operateFeeUnit = '', networkFeeValue = '', networkFeeUnit = '';
    if (direction == 'MINT') {
      operateFeeValue = new BigNumber(operateFee.mintFee).toFixed();
      operateFeeUnit = tool.getCoinSymbol(assetPair.fromChainType, assetPair.fromChainName);
      networkFeeValue = new BigNumber(networkFee.mintFee).toFixed();
      networkFeeUnit = tool.getCoinSymbol(assetPair.fromChainType, assetPair.fromChainName);
    } else {
      operateFeeValue = new BigNumber(operateFee.burnFee).toFixed();
      operateFeeUnit = tool.getCoinSymbol(assetPair.toChainType, assetPair.toChainName);
      networkFeeValue = new BigNumber(networkFee.burnFee).toFixed();
      networkFeeUnit = tool.getCoinSymbol(assetPair.fromChainType, assetPair.fromChainName);
    }
    return {operateFee: {value: operateFeeValue, unit: operateFeeUnit}, networkFee: {value: networkFeeValue, unit: networkFeeUnit}};
  }

  async getQuota(assetPair, direction) {
    direction = this._unifyDirection(direction);
    let fromChainType = (direction == "MINT")? assetPair.fromChainType : assetPair.toChainType;
    return this.storemanService.getStroremanGroupQuotaInfo(fromChainType, assetPair.assetPairId, assetPair.smgs[this.smgIndex % assetPair.smgs.length].id);
  }

  validateToAccount(assetPair, direction, account) {
    direction = this._unifyDirection(direction);
    let chainType = (direction == "MINT")? assetPair.toChainType : assetPair.fromChainType;
    if (["ETH", "BNB", "AVAX", "MOVR", "MATIC", "ARETH"].includes(chainType)) {
      return tool.isValidEthAddress(account);
    } else if ("WAN" == chainType) {
      return tool.isValidWanAddress(account);
    } else if ("BTC" == chainType) {
      return tool.isValidBtcAddress(account, this.network);
    } else if ("LTC" == chainType) {
      return tool.isValidLtcAddress(account, this.network);
    } else if ("DOGE" == chainType) {
      return tool.isValidDogeAddress(account, this.network);
    } else if ("XRP" == chainType) {
      return tool.isValidXrpAddress(account);
    } else if ("DOT" == chainType) {
      // PLAN: adapted to polka app
      return tool.isValidDotAddress(account, this.network);
    } else {
      console.error("unsupported chain %s", chainType);
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
          receivedAmount: task.receivedAmount,
          fee: task.fee,
          fromAccount: task.fromAccount,
          toAccount: task.toAccount,
          ota: task.ota,
          lockHash: task.lockHash,
          redeemHash: task.redeemHash,
          status: task.status,
          errInfo: task.errInfo
        }
        history.push(item);
      }
    });
    return history;
  }

  _onStoremanInitilized(success) {
    if (success) {
      let assetPairList = this.stores.assetPairs.assetPairList;
      this.emit("ready", assetPairList);
      console.debug("WanBridge is ready for %d assetPairs", assetPairList.length);
    } else {
      this.emit("error", {reason: "Failed to initialize storeman"});
      console.error("WanBridge has error");
    }
  }

  _onLockTxHash(taskLockHash) {
    console.debug("_onLockTxHash: %O", taskLockHash);
    let records = this.stores.crossChainTaskRecords;
    let taskId = taskLockHash.ccTaskId;
    let txHash = taskLockHash.txhash;
    let value = taskLockHash.sentAmount;
    let ccTask = records.ccTaskRecords.get(taskId);
    if (!ccTask) {
      return;
    }
    if (new BigNumber(ccTask.fee.networkFee.value).gte(value)) {
      let errInfo = "Amount is too small to pay the fee";
      records.modifyTradeTaskStatus(taskId, "Failed", errInfo);
      this.emit("error", {taskId, reason: errInfo});
    } else {
      records.modifyTradeTaskStatus(taskId, "Converting");
    }
    records.setTaskLockTxHash(taskId, txHash, value, taskLockHash.sender);
    this.storageService.save("crossChainTaskRecords", taskId, ccTask);
    this.emit("lock", {taskId, txHash});
  }

  _onLockTxTimeout(taskLockTimeout) {
    console.debug("_onLockTxTimeout: %O", taskLockTimeout);
    let records = this.stores.crossChainTaskRecords;
    let taskId = taskLockTimeout.ccTaskId;
    let ccTask = records.ccTaskRecords.get(taskId);
    if (ccTask && (ccTask.status !== "Timeout")) {
      let errInfo = "Waiting for locking asset timeout";
      records.modifyTradeTaskStatus(taskId, "Timeout", errInfo);
      this.storageService.save("crossChainTaskRecords", taskId, ccTask);
      this.emit("error", {taskId, reason: errInfo});
    }
  }

  _onRedeemTxHash(taskRedeemHash) {
    console.debug("_onRedeemTxHash: %O", taskRedeemHash);
    let records = this.stores.crossChainTaskRecords;
    let taskId = taskRedeemHash.ccTaskId;
    let txHash = taskRedeemHash.txhash;
    let ccTask = records.ccTaskRecords.get(taskId);
    if (!ccTask) {
      return;
    }
    // status
    let status = "Succeeded", errInfo = "";
    if (taskRedeemHash.toAccount !== undefined) {
      if (ccTask.toAccount.toLowerCase() != taskRedeemHash.toAccount.toLowerCase()) {
        console.error("tx toAccount %s does not match task toAccount %s", taskRedeemHash.toAccount, ccTask.toAccount);
        status = "Error";
        errInfo = "Please contact the Wanchain Foundation (techsupport@wanchain.org)";
        this.emit("error", {taskId, reason: errInfo});
      }
    }
    // received amount, TODO: get from chain
    let receivedAmount = new BigNumber(ccTask.sentAmount || ccTask.amount);
    if (['BTC', 'LTC', 'XRP', 'WND', 'DOT', 'DOGE'].includes(ccTask.assetType)) { // not-smart-contract asset
      if (ccTask.fee.networkFee.unit === ccTask.assetType) {
        receivedAmount = receivedAmount.minus(ccTask.fee.networkFee.value);
      }
      if (ccTask.fee.operateFee.unit === ccTask.assetType) {
        receivedAmount = receivedAmount.minus(ccTask.fee.operateFee.value);
      }
    }
    records.modifyTradeTaskStatus(taskId, status, errInfo);
    records.setTaskRedeemTxHash(taskId, txHash, receivedAmount.toFixed());
    this.storageService.save("crossChainTaskRecords", taskId, ccTask);
    this.emit("redeem", {taskId, txHash});
  }

  _unifyDirection(direction) {
    direction = direction.toUpperCase();
    if (!["MINT", "BURN"].includes(direction)) {
      throw "Invalid direction, must be MINT or BURN";
    }
    return direction;
  }

  _unifyWallet(wallet) { // TODO
    return wallet;
  }

  _isThirdPartyWallet(chainType) {
    return ["BTC", "LTC", "DOGE","XRP"].includes(chainType);
  }
}

module.exports = WanBridge;