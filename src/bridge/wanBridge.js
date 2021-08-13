const EventEmitter = require('events').EventEmitter;
const CrossChainTaskRecords = require('./stores/CrossChainTaskRecords');
const AssetPairs = require('./stores/AssetPairs');
const CrossChainTaskSteps = require('./stores/CrossChainTaskSteps');
const StartService = require('../gsp/startService/startService.js');
const BridgeTask = require('./bridgeTask.js');
const tool = require('../utils/tool.js');

class WanBridge extends EventEmitter {
  constructor(network = "testnet", smgIndex = 0) { // smgIndex is for testing only
    super();
    this.network = (network == "mainnet")? "mainnet" : "testnet";
    this.smgIndex = smgIndex;
    this.stores = {
      crossChainTaskRecords: new CrossChainTaskRecords(),
      assetPairs: new AssetPairs(),
      crossChainTaskSteps: new CrossChainTaskSteps()
    };
    this._service = new StartService();
  }

  async init(iwanAuth) {
    console.log("init WanBridge SDK");
    await this._service.init(this.network, this.stores, iwanAuth);
    this.eventService = this._service.getService("EventService");
    this.configService = this._service.getService("ConfigService");
    this.storemanService = this._service.getService("StoremanService");
    this.storageService = this._service.getService("StorageService");
    this.feesService = this._service.getService("CrossChainFeesService");
    this.chainInfoService = this._service.getService("ChainInfoService");
    this.eventService.addEventListener("ReadStoremanInfoComplete", this._onStoremanInitilized.bind(this));
    this.eventService.addEventListener("LockTxHash", this._onLockTxHash.bind(this));
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
    task.start();
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
    this.storageService.save("crossChainTaskRecords", taskId, ccTask);
  }

  async getAccountAsset(assetPair, direction, account, isCoin = false) {
    direction = this._unifyDirection(direction);
    let balance = await this.storemanService.getAccountBalance(assetPair.assetPairId, direction, account, isCoin);
    return parseFloat(balance);
  };

  async estimateFee(assetPair, direction) {
    direction = this._unifyDirection(direction);
    let operateFee = await this.feesService.getServcieFees(assetPair.assetPairId, direction);
    let networkFee = await this.feesService.estimateNetworkFee(assetPair.assetPairId, direction);
    let operateFeeValue = '', operateFeeUnit = '', networkFeeValue = '', networkFeeUnit = '';
    if (direction == 'MINT') {
      operateFeeValue = parseFloat(operateFee.mintFee);
      operateFeeUnit = tool.getFeeUnit(assetPair.fromChainType, assetPair.fromChainName);
      networkFeeValue = parseFloat(networkFee.mintFee);
      networkFeeUnit = tool.getFeeUnit(assetPair.fromChainType, assetPair.fromChainName);
    } else {
      operateFeeValue = parseFloat(operateFee.burnFee);
      operateFeeUnit = tool.getFeeUnit(assetPair.toChainType, assetPair.toChainName);
      networkFeeValue = parseFloat(networkFee.burnFee);
      networkFeeUnit = tool.getFeeUnit(assetPair.fromChainType, assetPair.fromChainName);
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
    if (["ETH", "BNB", "AVAX", "DEV", "MATIC", "ARETH"].includes(chainType)) {
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

  _onStoremanInitilized(success) {
    if (success) {
      this.emit("ready", this.stores.assetPairs.assetPairList);
    } else {
      this.emit("error", {reason: "Failed to initialize storeman"});
    }
    console.debug("assetPairList: %O", this.stores.assetPairs.assetPairList);
  }

  _onLockTxHash(taskLockHash) {
    console.log("_onLockTxHash: %O", taskLockHash);
    let records = this.stores.crossChainTaskRecords;
    let taskId = taskLockHash.ccTaskId;
    let txHash = taskLockHash.txhash;
    let value = taskLockHash.sentAmount;
    let ccTask = records.ccTaskRecords.get(taskId);
    if (!ccTask) {
      return;
    }
    if (parseFloat(ccTask.networkFee) >= parseFloat(value)) {
      records.modifyTradeTaskStatus(taskId, "Failed");
    }else{
      records.modifyTradeTaskStatus(taskId, "Converting");
    }
    records.setTaskSentAmount(taskId, value);
    records.setTaskLockTxHash(taskId, txHash, taskLockHash.sender);
    this.storageService.save("crossChainTaskRecords", taskId, ccTask);
    this.emit("lock", {taskId, txHash});
  }

  _onRedeemTxHash(taskRedeemHash) {
    console.log("_onRedeemTxHash: %O", taskRedeemHash);
    let records = this.stores.crossChainTaskRecords;
    let taskId = taskRedeemHash.ccTaskId;
    let txHash = taskRedeemHash.txhash;
    let ccTask = records.ccTaskRecords.get(taskId);
    if (!ccTask) {
      return;
    }
    let status = "Succeeded";
    if (taskRedeemHash.toAccount !== undefined) {
      if (ccTask.toAccount.toLowerCase() != taskRedeemHash.toAccount.toLowerCase()) {
        console.error("tx toAccount %s does not match task toAccount %s", taskRedeemHash.toAccount, ccTask.toAccount);
        status = "Error";
      }
    }
    records.modifyTradeTaskStatus(taskId, status);
    records.setTaskRedeemTxHash(taskId, txHash);
    this.storageService.save("crossChainTaskRecords", taskId, ccTask);
    this.emit("redeem", {taskId, txHash, status});
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
    return ["BTC", "LTC", "XRP"].includes(chainType);
  }
}

module.exports = WanBridge;