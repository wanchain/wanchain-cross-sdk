const EventEmitter = require('events').EventEmitter;
const CrossChainTaskRecords = require('./stores/CrossChainTaskRecords');
const AssetPairs = require('./stores/AssetPairs');
const CrossChainTaskSteps = require('./stores/CrossChainTaskSteps');
const StartService = require('../gsp/startService/startService.js');
const BridgeTask = require('./bridgeTask.js');
const tool = require('../utils/tool.js');
const BigNumber = require("bignumber.js");

const THIRD_PARTY_WALLET_CHAINS = ["BTC", "LTC", "DOGE", "XRP"];

// consistant with crosschain contract
const MAX_NFT_BATCH_SIZE = 10;

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
    console.debug("SDK: init, network: %s, isTestMode: %s, smgIndex: %s, ver: 2302151206", this.network, this.isTestMode, this.smgIndex);
    await this._service.init(this.network, this.stores, iwanAuth);
    this.eventService = this._service.getService("EventService");
    this.storemanService = this._service.getService("StoremanService");
    this.storageService = this._service.getService("StorageService");
    this.feesService = this._service.getService("CrossChainFeesService");
    this.chainInfoService = this._service.getService("ChainInfoService");
    this.globalConstant = this._service.getService("GlobalConstant");
    this.tokenPairService = this._service.getService("TokenPairService");
    this.txTaskHandleService = this._service.getService("TxTaskHandleService");
    this.cctHandleService = this._service.getService("CCTHandleService");
    this.eventService.addEventListener("ReadStoremanInfoComplete", this._onStoremanInitilized.bind(this)); // for token pair service to notify data ready
    this.eventService.addEventListener("LockTxHash", this._onLockTxHash.bind(this)); // for BTC/LTC/DOGE/XRP(thirdparty wallet) to notify lock txHash and sentAmount
    this.eventService.addEventListener("LockTxTimeout", this._onLockTxTimeout.bind(this)); // for BTC/LTC/DOGE/XRP to set lock tx timeout
    this.eventService.addEventListener("RedeemTxHash", this._onRedeemTxHash.bind(this)); // for all to notify redeem txHash
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
      await this.tokenPairService.updateSmgs();
      smgs = this.stores.assetPairs.smgList;
      smg = smgs[this.smgIndex % smgs.length];
      changed = true; // optimize for mainnet getQuota performance issue
    }
    return Object.assign({}, smg, {changed});
  }

  async checkWallet(chainName, wallet) {
    console.debug("SDK: checkWallet, chainName: %s, wallet: %s", chainName, wallet? wallet.type : undefined);
    let chainType = this.tokenPairService.getChainType(chainName);
    if (this._isThirdPartyWallet(chainType)) {
      return true;
    } else {
      let chainInfo = this.chainInfoService.getChainInfoByType(chainType);
      if (chainInfo.MaskChainId) {
        if (wallet) {
          let walletChainId = await wallet.getChainId();
          if (chainInfo.MaskChainId == walletChainId) {
            return true;
          } else {
            console.debug("SDK: checkWallet id %s != %s", walletChainId, chainInfo.MaskChainId);
            return false;
          }
        } else {
          return false;
        }
      } else {
        return true;
      }
    }
  }

  async createTask(assetType, fromChainName, toChainName, amount, fromAccount, toAccount, options = {}) {
    console.debug("SDK: createTask, assetType: %s, fromChainName: %s, toChainName: %s, amount: %O, fromAccount: %s, toAccount: %s, wallet: %s, time: %s ms",
                  assetType, fromChainName, toChainName, amount, fromAccount, toAccount, options.wallet? options.wallet.type : undefined, tool.getCurTimestamp());
    let assetPair = this._getAssetPair(assetType, fromChainName, toChainName, options);
    if (!assetPair) {
      throw new Error("Asset pair not exist");
    }
    let fromChainType = this.tokenPairService.getChainType(fromChainName);
    // check fromAccount
    if (this._isThirdPartyWallet(fromChainType)) {
      fromAccount = "";
    } else if (fromAccount) {
      if (!this.validateToAccount(fromChainName, fromAccount)) {
        throw new Error("Invalid fromAccount");
      }
    } else {
      throw new Error("Missing fromAccount");
    }
    // check toAccount
    if (!(toAccount && this.validateToAccount(toChainName, toAccount))) {
      throw new Error("Invalid toAccount");
    }
    // check wallet
    let wallet = options.wallet;
    if (this._isThirdPartyWallet(fromChainType)) {
      wallet = null;
    } else if (!wallet) {
      throw new Error("Missing wallet");
    }
    // create task
    let direction = (fromChainName === assetPair.fromChainName)? "MINT" : "BURN";
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

  async getAccountBalance(assetType, chainName, account, options = {}) {
    let balance = "0";
    let assetPair = this._getAssetPair(assetType, chainName, chainName, options);
    if (assetPair) {
      let chainType = this.tokenPairService.getChainType(chainName);
      balance = await this.storemanService.getAccountBalance(assetPair.assetPairId, chainType, account, options);
      balance = balance.toFixed();
    }
    console.debug("SDK: getAccountBalance, assetType: %s, chainName: %s, account: %s, options: %O, result: %s", assetType, chainName, account,
                  {isCoin: options.isCoin, keepAlive: options.keepAlive, wallet: options.wallet? options.wallet.type : undefined},
                  balance);
    return balance;
  }

  async estimateFee(assetType, fromChainName, toChainName, options = {}) {
    let fee = null; // no default value
    let assetPair = this._getAssetPair(assetType, fromChainName, toChainName, options);
    if (assetPair) {
      let fromChainType = this.tokenPairService.getChainType(fromChainName);
      let toChainType = this.tokenPairService.getChainType(toChainName);
      let operateFee = await this.feesService.estimateOperationFee(assetPair.assetPairId, fromChainType, toChainType);
      let networkFee = await this.feesService.estimateNetworkFee(assetPair.assetPairId, fromChainType, toChainType, options);
      fee = {
        operateFee: {value: operateFee.fee, unit: operateFee.unit, isRatio: operateFee.isRatio, min: operateFee.min, max: operateFee.max, decimals: operateFee.decimals},
        networkFee: {value: networkFee.fee, unit: networkFee.unit, isRatio: networkFee.isRatio, min: networkFee.min, max: networkFee.max, decimals: networkFee.decimals}
      };
    }
    console.debug("SDK: estimateFee, assetType: %s, fromChainName: %s, toChainName: %s, options: %O, result: %O", assetType, fromChainName, toChainName, options, fee);
    return fee;
  }

  async getQuota(assetType, fromChainName, toChainName, options = {}) {
    let quota = {maxQuota: "0", minQuota: "0"};
    let protocol = options.protocol || "Erc20";
    if (protocol === "Erc20") {
      let assetPair = this._getAssetPair(assetType, fromChainName, toChainName, options);
      if (assetPair) {
        let fromChainType = this.tokenPairService.getChainType(fromChainName);
        let smg = await this.getSmgInfo();
        quota = await this.storemanService.getStroremanGroupQuotaInfo(fromChainType, assetPair.assetPairId, smg.id);
      }
    } else {
      quota.maxQuota = MAX_NFT_BATCH_SIZE.toString();
    }
    console.debug("SDK: getQuota, assetType: %s, fromChainName: %s, toChainName: %s, options: %O, result: %O", assetType, fromChainName, toChainName, options, quota);
    return quota;
  }

  validateToAccount(chainName, account) {
    let chainType = this.tokenPairService.getChainType(chainName);
    if (this.stores.assetPairs.isTokenAccount(chainType, account)) {
      console.error("SDK: validateToAccount, chainName: %s, account: %s, result: is token account", chainName, account);
      return false;
    }
    if (["ETH", "BNB", "AVAX", "MOVR", "GLMR", "MATIC", "ARETH", "FTM", "OETH", "OKT", "CLV", "FX", "ASTR", "TLOS"].includes(chainType)) {
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
    } else if (["DOT", "PHA"].includes(chainType)) {
      return tool.isValidPolkadotAddress(account, chainType, this.network);
    } else if ("ADA" === chainType) {
      return tool.isValidAdaAddress(account, this.network);
    } else if ("XDC" === chainType) {
      return tool.isValidXdcAddress(account);
    } else if ("TRX" === chainType) {
      return tool.isValidTrxAddress(account);
    } else {
      console.error("SDK: validateToAccount, chainName: %s, account: %s, result: unsupported chain", chainName, account);
      return false;
    }
  }

  validateXrpTokenAmount(amount) {
    return tool.validateXrpTokenAmount(amount);
  }

  async getNftInfo(assetType, chainName, account, options) {
    let infos = [];
    let assetPair = this._getAssetPair(assetType, chainName, chainName, options);
    if (assetPair) {
      let token = (chainName === assetPair.fromChainName)? assetPair.fromAccount : assetPair.toAccount;
      let chainType = this.tokenPairService.getChainType(chainName);
      infos = await this.storemanService.getNftInfo(assetPair.protocol, chainType, token, account, options);
    }
    console.debug("SDK: getNftInfo, assetType: %s, chainName: %s, account: %s, options: %O, result: %O", assetType, chainName, account, options, infos);
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
          fromSymbol: task.fromSymbol,
          toSymbol: task.toSymbol,          
          fromChain: task.fromChainName,
          toChain: task.toChainName,
          amount: task.sentAmount || task.amount,
          fromDecimals: task.fromDecimals,
          toDecimals: task.toDecimals,
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

  getAssetLogo(name, protocol) {
    return this.tokenPairService.getAssetLogo(name, protocol);
  }

  getChainLogo(chainName) {
    let chainType = this.tokenPairService.getChainType(chainName);
    return this.tokenPairService.getChainLogo(chainType);
  }

  _onStoremanInitilized(success) {
    if (success) {
      let assetPairList = this.stores.assetPairs.assetPairList;
      this.emit("ready", assetPairList.map(v => Object.assign({}, v)));
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
    let fee = new BigNumber(tool.parseFee(ccTask.fee, ccTask.amount, ccTask.assetType));
    if (fee.gte(value)) {
      let errInfo = "Amount is too small to pay the bridge fee";
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
    let receivedAmount;
    if (ccTask.protocol === "Erc20") {
      let sentAmount = ccTask.sentAmount || ccTask.amount;
      let expected = new BigNumber(sentAmount);
      let fee = tool.parseFee(ccTask.fee, expected, ccTask.assetType);
      expected = expected.minus(fee).toFixed();
      if (taskRedeemHash.value) {
        receivedAmount = new BigNumber(taskRedeemHash.value).div(Math.pow(10, ccTask.toDecimals)).toFixed();
        if (receivedAmount !== expected) {
          this._updateFee(taskId, ccTask.fee, ccTask.assetType, sentAmount, receivedAmount);
        }
      } else {
        receivedAmount = expected;
      }
    } else {
      receivedAmount = ccTask.amount;
    }
    records.modifyTradeTaskStatus(taskId, status, errInfo);
    records.setTaskRedeemTxHash(taskId, txHash, receivedAmount);
    this.storageService.save("crossChainTaskRecords", taskId, ccTask);
    this.emit("redeem", {taskId, txHash});
  }

  _updateFee(taskId, taskFee, assetType, sentAmount, receivedAmount) {
    let records = this.stores.crossChainTaskRecords;
    let fee = new BigNumber(sentAmount).minus(receivedAmount).toFixed();
    let feeType = "", candidateFeeType = ""; // prefer to update exist fee
    if (taskFee.networkFee.unit === assetType) {
      candidateFeeType = "networkFee";
      if (taskFee.networkFee.value !== "0") {
        feeType = "networkFee";
      }
    }
    if (taskFee.operateFee.unit === assetType) {
      candidateFeeType = candidateFeeType || "operateFee";
      if (taskFee.operateFee.value !== "0") {
        feeType = feeType || "operateFee";
      }
    }
    feeType = feeType || candidateFeeType;
    if (feeType) {
      if (feeType === "networkFee") {
        records.updateTaskFee(taskId, "networkFee", fee, true);
        if (taskFee.operateFee.unit === assetType) {
          records.updateTaskFee(taskId, "operateFee", "0", true);
        }
      } else {
        records.updateTaskFee(taskId, "operateFee", fee, true);
        if (taskFee.networkFee.unit === assetType) {
          records.updateTaskFee(taskId, "networkFee", "0", true);
        }
      }
      console.debug("SDK: update task %d fee: %s%s", taskId, fee, assetType);
    } else {
      console.error("SDK: can't update task %d fee: %s%s", taskId, fee, assetType);
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

  _isThirdPartyWallet(chainType) {
    return THIRD_PARTY_WALLET_CHAINS.includes(chainType);
  }

  _getAssetPair(assetType, fromChainName, toChainName, options = {}) {
    let protocol = options.protocol || "Erc20";
    let assetPairList = this.stores.assetPairs.assetPairList;
    for (let i = 0; i < assetPairList.length; i++) {
      let pair = assetPairList[i];
      // avalance BTC.a assetType is still BTC, it is converted by frontend
      let ancestorSymbol = (pair.assetPairId === "41")? "BTC.a" : pair.assetType;
      if ((ancestorSymbol === assetType) && (pair.protocol === protocol)) {
        // if fromChainName and toChainName are the same, find any one of related pairs
        if ([pair.fromChainName, pair.toChainName].includes(fromChainName) && [pair.fromChainName, pair.toChainName].includes(toChainName)) {
          return pair;
        }
      }
    }
    console.error("SDK: _getAssetPair, no matched %s assetPair for %s@%-%s", protocol, assetType, fromChainName, toChainName);
    return null;
  }
}

module.exports = WanBridge;