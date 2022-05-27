const EventEmitter = require('events').EventEmitter;
const CrossChainTaskRecords = require('./stores/CrossChainTaskRecords');
const AssetPairs = require('./stores/AssetPairs');
const CrossChainTaskSteps = require('./stores/CrossChainTaskSteps');
const StartService = require('../gsp/startService/startService.js');
const BridgeTask = require('./bridgeTask.js');
const tool = require('../utils/tool.js');
const BigNumber = require("bignumber.js");

const THIRD_PARTY_WALLET_CHAINS = ["BTC", "LTC", "DOGE", "XRP"];

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
    console.debug("SDK: init, network: %s, isTestMode: %s, smgIndex: %s, ver: 1058", this.network, this.isTestMode, this.smgIndex);
    await this._service.init(this.network, this.stores, iwanAuth);
    this.eventService = this._service.getService("EventService");
    this.configService = this._service.getService("ConfigService");
    this.storemanService = this._service.getService("StoremanService");
    this.storageService = this._service.getService("StorageService");
    this.feesService = this._service.getService("CrossChainFeesService");
    this.chainInfoService = this._service.getService("ChainInfoService");
    this.globalConstant = this._service.getService("GlobalConstant");
    this.iWanConnectorService = this._service.getService("iWanConnectorService");
    this.eventService.addEventListener("ReadStoremanInfoComplete", this._onStoremanInitilized.bind(this)); // for token pair service to notify data ready
    this.eventService.addEventListener("LockTxHash", this._onLockTxHash.bind(this)); // for BTC/LTC/DOGE/XRP(thirdparty wallet) to notify lock txHash and sentAmount
    this.eventService.addEventListener("LockTxTimeout", this._onLockTxTimeout.bind(this)); // for BTC/LTC/DOGE/XRP to set lock tx timeout
    this.eventService.addEventListener("RedeemTxHash", this._onRedeemTxHash.bind(this)); // for all to notify redeem txHash
    this.eventService.addEventListener("NetworkFee", this._onNetworkFee.bind(this)); // for BTC/LTC/DOGE to update network fee got from api server
    this.eventService.addEventListener("TaskStepResult", this._onTaskStepResult.bind(this)); // for tx receipt service to update result
    await this._service.start();
  }

  isReady() {
    return this.stores.assetPairs.isReady();
  }

  async getSmgInfo() {
    let changed = false;
    let smgs = this.stores.assetPairs.smgList;
    let smg = smgs[this.smgIndex % smgs.length];
    let curTime = tool.getCurTimestamp(true);
    if (curTime >= smg.endTime) {
      console.log("SDK: getSmgInfo, smg %s timeout", smg.id);
      await this.storemanService.updateSmgs();
      smgs = this.stores.assetPairs.smgList;
      smg = smgs[this.smgIndex % smgs.length];
      changed = true; // optimize for mainnet getQuota performance issue
    }
    return Object.assign({}, smg, {changed});
  }

  async checkWallet(assetPair, direction, wallet) {
    console.debug("SDK: checkWallet, pair: %s, direction: %s, wallet: %s", assetPair.assetPairId, direction, wallet? wallet.type : undefined);
    direction = this._unifyDirection(direction);
    let chainType = (direction === "MINT")? assetPair.fromChainType : assetPair.toChainType;
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
    console.debug("SDK: createTask, pair: %s, direction: %s, amount: %s, fromAccount: %s, toAccount: %s, wallet: %s, time: %s ms",
                  assetPair.assetPairId, direction, amount, fromAccount, toAccount, wallet? wallet.type : undefined, tool.getCurTimestamp());
    direction = this._unifyDirection(direction);
    let fromChainType = (direction === "MINT")? assetPair.fromChainType : assetPair.toChainType;
    // check fromAccount
    if (this._isThirdPartyWallet(fromChainType)) {
      fromAccount = "";
    } else if (fromAccount) {
      let tmpDirection = (direction === "MINT")? "BURN" : "MINT";
      if (!this.validateToAccount(assetPair, tmpDirection, fromAccount)) {
        throw new Error("Invalid fromAccount");
      }
    } else {
      throw new Error("Missing fromAccount");
    }
    // check toAccount
    if (!(toAccount && this.validateToAccount(assetPair, direction, toAccount))) {
      throw new Error("Invalid toAccount");
    }
    // check wallet
    if (this._isThirdPartyWallet(fromChainType)) {
      wallet = null;
    } else if (wallet) {
      wallet = this._unifyWallet(wallet);
    } else {
      throw new Error("Missing wallet");
    }
    // create task
    let task = new BridgeTask(this, assetPair, direction, fromAccount, toAccount, amount, wallet);
    await task.init();
    await task.start();
    return task;
  }

  cancelTask(taskId) {
    console.debug("SDK: cancelTask, taskId: %s", taskId);
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

  async getAccountAsset(assetPair, direction, account, options) {
    direction = this._unifyDirection(direction);
    let balance = await this.storemanService.getAccountBalance(assetPair.assetPairId, direction, account, options);
    balance = balance.toFixed();
    console.debug("SDK: getAccountAsset, pair: %s, direction: %s, account: %s, options: %O, result: %s", assetPair.assetPairId, direction, account,
                  {isCoin: options.isCoin, keepAlive: options.keepAlive, wallet: options.wallet? options.wallet.type : undefined},
                  balance);
    return balance;
  }

  async estimateFee(assetPair, direction) {
    direction = this._unifyDirection(direction);
    let operateFee = await this.feesService.estimateOperationFee(assetPair.assetPairId, direction);
    let networkFee = await this.feesService.estimateNetworkFee(assetPair.assetPairId, direction);
    let fee = {
      operateFee: {value: operateFee.fee, unit: operateFee.unit, isRatio: operateFee.isRatio},
      networkFee: {value: networkFee.fee, unit: networkFee.unit, isRatio: networkFee.isRatio}
    };
    console.debug("SDK: estimateFee, pair: %s, direction: %s, result: %O", assetPair.assetPairId, direction, fee);
    return fee;
  }

  async getQuota(assetPair, direction) {
    direction = this._unifyDirection(direction);
    let fromChainType = (direction === "MINT")? assetPair.fromChainType : assetPair.toChainType;
    let smg = await this.getSmgInfo();
    let quota = await this.storemanService.getStroremanGroupQuotaInfo(fromChainType, assetPair.assetPairId, smg.id);
    console.debug("SDK: getQuota, pair: %s, direction: %s, smg: %s, result: %O", assetPair.assetPairId, direction, smg.id, quota);
    return quota;
  }

  validateToAccount(assetPair, direction, account) {
    if (this.stores.assetPairs.isTokenAccount(account)) {
      console.error("SDK: validateToAccount, pair: %s, direction: %s, account: %s, result: is token account", assetPair.assetPairId, direction, account);
      return false;
    }
    direction = this._unifyDirection(direction);
    let chainType = (direction === "MINT")? assetPair.toChainType : assetPair.fromChainType;
    if (["ETH", "BNB", "AVAX", "MOVR", "GLMR", "MATIC", "ARETH", "FTM", "OETH"].includes(chainType)) {
      return tool.isValidEthAddress(account);
    } else if ("WAN" === chainType) {
      return tool.isValidWanAddress(account);
    } else if ("BTC" === chainType) {
      return tool.isValidBtcAddress(account, this.network);
    } else if ("LTC" === chainType) {
      return tool.isValidLtcAddress(account, this.network);
    } else if ("DOGE" === chainType) {
      return tool.isValidDogeAddress(account, this.network);
    } else if ("XRP" === chainType) {
      return tool.isValidXrpAddress(account);
    } else if ("DOT" === chainType) {
      return tool.isValidDotAddress(account, this.network);
    } else if ("ADA" === chainType) {
      return tool.isValidAdaAddress(account, this.network);
    } else if ("XDC" === chainType) {
      return tool.isValidXdcAddress(account);
    } else if ("TRX" === chainType) {
      return tool.isValidTrxAddress(account);
    } else {
      console.error("SDK: validateToAccount, pair: %s, direction: %s, result: unsupported chain %s", assetPair.assetPairId, direction, chainType);
      return false;
    }
  }

  async getNftInfo(assetPair, direction, account, startIndex, endIndex) {
    direction = this._unifyDirection(direction);
    let chainType = (direction === "MINT")? assetPair.fromChainType : assetPair.toChainType;
    // let tokenPair = this.storemanService.getTokenPair(assetPair.assetPairId); // do not get info from ancestorChain
    // let ancestorChain = this.chainInfoService.getChainInfoById(tokenPair.ancestorChainID);
    let token = (direction === "MINT")? assetPair.fromAccount : assetPair.toAccount;
    let infos = await this.iWanConnectorService.getNftInfoMulticall(chainType, token, chainType, token, account, startIndex, endIndex);
    console.debug("SDK: getNftInfo, pair: %s, direction: %s, account: %s, startIndex: %d, endIndex: %d, chain: %s, asset: %s, result: %O",
                  assetPair.assetPairId, direction, account, startIndex, endIndex, chainType, assetPair.assetType, infos);
    return infos;
  }

  getHistory(options) {
    let taskId = undefined, protocol = undefined;
    if (options) {
      taskId = options.taskId;
      protocol = options.protocol;
    }
    let history = [];
    let records = this.stores.crossChainTaskRecords;
    for (let [id, task] of records.ccTaskRecords) {
      if (((taskId === undefined) || (taskId == id)) && ((protocol === undefined) || (protocol === task.protocol))) {
        let item = {
          taskId: task.ccTaskId,
          pairId: task.assetPairId,
          timestamp: task.ccTaskId,
          asset: task.assetType,
          protocol: task.protocol,
          direction: task.convertType,
          fromSymbol: task.fromSymbol,
          toSymbol: task.toSymbol,          
          fromChain: task.fromChainName,
          toChain: task.toChainName,
          amount: task.sentAmount || task.amount,
          decimals: task.decimals,
          receivedAmount: task.receivedAmount,
          fee: task.fee,
          fromAccount: task.fromAccount,
          toAccount: task.toAccount,
          ota: task.ota,
          lockHash: task.lockHash,
          redeemHash: task.redeemHash,
          uniqueId: task.uniqueId || "",
          status: task.status,
          errInfo: task.errInfo
        };
        history.push(item);
        if (taskId !== undefined) { // only get one
          break;
        }
      }
    }
    console.debug("SDK: getHistory, options: %O, count: %d", options, history.length);
    return history;
  }

  async deleteHistory(options) {
    let taskId = undefined, protocol = undefined;
    if (options) {
      taskId = options.taskId;
      protocol = options.protocol;
    }
    let count = 0;
    let records = this.stores.crossChainTaskRecords;
    let ids = Array.from(records.ccTaskRecords.values())
      .filter(v => (((taskId === undefined) || (taskId == v.ccTaskId)) && ((protocol === undefined) || (protocol === v.protocol))))
      .map(v => v.ccTaskId);
    for (let i = 0; i < ids.length; i++) {
      let id = ids[i];
      records.removeTradeTask(id);
      await this.storageService.delete("crossChainTaskRecords", id);
      count++;
    }
    console.debug("SDK: deleteHistory, options: %O, count: %d", options, count);
    return count;
  }

  getAssetLogo(name) {
    return this.storemanService.getAssetLogo(name);
  }

  getChainLogo(chainType) {
    return this.storemanService.getChainLogo(chainType);
  }

  _onStoremanInitilized(success) {
    if (success) {
      let assetPairList = this.stores.assetPairs.assetPairList;
      this.emit("ready", assetPairList);
      console.debug("WanBridge is ready for %d assetPairs and %d smgs", assetPairList.length, this.stores.assetPairs.smgList.length);
    } else {
      this.emit("error", {reason: "Failed to initialize storeman"});
      console.error("WanBridge has error");
    }
  }

  _onLockTxHash(taskLockHash) {
    console.debug("_onLockTxHash: %O", taskLockHash);
    let records = this.stores.crossChainTaskRecords;
    let taskId = taskLockHash.ccTaskId;
    let txHash = taskLockHash.txHash;
    let value = taskLockHash.sentAmount;
    let ccTask = records.ccTaskRecords.get(taskId);
    if (!ccTask) {
      return;
    }
    let fee = new BigNumber(tool.parseFee(ccTask.fee, ccTask.amount, ccTask.assetType, ccTask.decimals));
    if (fee.gte(value)) {
      let errInfo = "Amount is too small to pay the fee";
      console.error({taskId, errInfo});
      records.modifyTradeTaskStatus(taskId, "Failed", errInfo);
      this.emit("error", {taskId, reason: errInfo});
    } else {
      records.modifyTradeTaskStatus(taskId, "Converting");
    }
    records.setTaskLockTxHash(taskId, txHash, value, taskLockHash.sender, taskLockHash.uniqueId);
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
    let txHash = taskRedeemHash.txHash;
    let ccTask = records.ccTaskRecords.get(taskId);
    if (!ccTask) {
      return;
    }
    // status
    let status = "Succeeded", errInfo = "";
    if (taskRedeemHash.toAccount !== undefined) {
      let expectedToAccount = tool.getStandardAddressInfo(ccTask.toChainType, ccTask.toAccount).native;
      let actualToAccount = tool.getStandardAddressInfo(ccTask.toChainType, taskRedeemHash.toAccount).native;
      if (!tool.cmpAddress(expectedToAccount, actualToAccount)) {
        console.error("actual toAccount %s(%s) does not match expected toAccount %s(%s)", actualToAccount, taskRedeemHash.toAccount, expectedToAccount, ccTask.toAccount);
        status = "Error";
        errInfo = "Please contact the Wanchain Foundation (techsupport@wanchain.org)";
        this.emit("error", {taskId, reason: errInfo});
      }
    }
    // received amount, TODO: get actual value from chain
    let receivedAmount = new BigNumber(ccTask.sentAmount || ccTask.amount);
    let fee = tool.parseFee(ccTask.fee, receivedAmount, ccTask.assetType, ccTask.decimals);
    receivedAmount = receivedAmount.minus(fee).toFixed();
    records.modifyTradeTaskStatus(taskId, status, errInfo);
    records.setTaskRedeemTxHash(taskId, txHash, receivedAmount);
    this.storageService.save("crossChainTaskRecords", taskId, ccTask);
    this.emit("redeem", {taskId, txHash});
  }

  _onNetworkFee(taskNetworkFee) {
    console.log("_onNetworkFee: %O", taskNetworkFee);
    let records = this.stores.crossChainTaskRecords;
    let taskId = taskNetworkFee.ccTaskId;
    let networkFee = new BigNumber(taskNetworkFee.apiServerNetworkFee).toFixed();
    let ccTask = records.ccTaskRecords.get(taskId);
    if (ccTask) {
      records.setTaskNetworkFee(taskId, networkFee);
      this.storageService.save("crossChainTaskRecords", taskId, ccTask);
    }
  }

  _onTaskStepResult(taskStepResult) {
    console.log("_onTaskStepResult: %O", taskStepResult);
    let taskId = taskStepResult.ccTaskId;
    let stepIndex = taskStepResult.stepIndex;
    let txHash = taskStepResult.txHash;
    let result = taskStepResult.result;
    let errInfo = taskStepResult.errInfo || "";
    this.stores.crossChainTaskSteps.finishTaskStep(taskId, stepIndex, txHash, result, errInfo);
    let records = this.stores.crossChainTaskRecords;
    let ccTask = records.ccTaskRecords.get(taskId);
    if (ccTask) {
      let isLockTx = records.updateTaskByStepResult(taskId, stepIndex, txHash, result, errInfo);
      if (isLockTx) {
        let lockEvent = {taskId, txHash};
        console.debug("lockEvent: %O", lockEvent);
        this.emit("lock", lockEvent);
      }
      this.storageService.save("crossChainTaskRecords", taskId, ccTask);
    }
  }

  _unifyDirection(direction) {
    direction = direction.toUpperCase();
    if (!["MINT", "BURN"].includes(direction)) {
      throw new Error("Invalid direction, must be MINT or BURN");
    }
    return direction;
  }

  _unifyWallet(wallet) { // TODO
    return wallet;
  }

  _isThirdPartyWallet(chainType) {
    return THIRD_PARTY_WALLET_CHAINS.includes(chainType);
  }
}

module.exports = WanBridge;