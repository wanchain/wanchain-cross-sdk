const EventEmitter = require('events').EventEmitter;
const CrossChainTaskRecords = require('./stores/CrossChainTaskRecords');
const AssetPairs = require('./stores/AssetPairs');
const StartService = require('../gsp/startService/startService.js');
const BridgeTask = require('./bridgeTask.js');
const tool = require('../utils/tool.js');
const BigNumber = require("bignumber.js");

const THIRD_PARTY_WALLET_CHAINS = ["BTC", "LTC", "DOGE", "XRP"];

// consistant with crosschain contract
const MAX_NFT_BATCH_SIZE = 10;

class WanBridge extends EventEmitter {
  constructor(network = "testnet", options = {}) { // options is only for dev
    super();
    this.network = (network == "mainnet")? "mainnet" : "testnet";
    this.isTestMode = options.isTestMode || false;
    this.smgName = options.smgName || "";
    this.stores = {
      crossChainTaskRecords: new CrossChainTaskRecords(),
      assetPairs: new AssetPairs(),
    };
  }

  async init(iwanAuth, options = {}) {
    console.debug("SDK: init, network: %s, isTestMode: %s, smgName: %s, ver: 2305311058", this.network, this.isTestMode, this.smgName);
    this._service = new StartService();
    await this._service.init(this.network, this.stores, iwanAuth, Object.assign(options, {isTestMode: this.isTestMode}));
    this.configService = this._service.getService("ConfigService");
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
    let smg = this.selectSmg();
    let curTime = tool.getCurTimestamp(true);
    if (curTime >= smg.endTime) {
      console.log("SDK: getSmgInfo, smg %s(%s) timeout", smg.name, smg.id);
      await this.tokenPairService.updateSmgs();
      smg = this.selectSmg();
      changed = true; // optimize for mainnet getQuota performance issue
    }
    return Object.assign({}, smg, {changed});
  }

  selectSmg() {
    let smgs = this.stores.assetPairs.smgList;
    if (smgs.length) {
      if (this.network === "mainnet") {
        return smgs[0]; // mainnet has only 1 smg, and do not support specify group
      }
      let requiredSmg = this.smgName || "testnet"; // default find a testnet group
      let defaultSmg = null;
      for (let smg of smgs) {
        if (smg.name === requiredSmg) { // specific group
          return smg;
        } else if ((!defaultSmg) && ["testnet", "dev"].includes(requiredSmg)) { // group type
          if (smg.name.indexOf(requiredSmg) === 0) {
            defaultSmg = smg;
          }
        }
      }
      if (defaultSmg) {
        return defaultSmg;
      }
    }
    throw new Error("Storeman " + (this.smgName || this.network) + " unavailable");
  }

  async checkWallet(chainName, wallet) {
    console.debug("SDK: checkWallet, chainName: %s, wallet: %s", chainName, wallet? wallet.name : undefined);
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
                  assetType, fromChainName, toChainName, amount, fromAccount, toAccount, options.wallet? options.wallet.name : undefined, tool.getCurTimestamp());
    let tokenPair = this._matchTokenPair(assetType, fromChainName, toChainName, options);
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
    let direction = (fromChainName === tokenPair.fromChainName)? "MINT" : "BURN";
    let task = new BridgeTask(this, tokenPair, direction, fromAccount, toAccount, amount, wallet);
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
    console.debug("SDK: getAccountBalance, assetType: %s, chainName: %s, account: %s, options: %O", assetType, chainName, account,
                  {isCoin: options.isCoin, keepAlive: options.keepAlive, wallet: options.wallet? options.wallet.name : undefined});
    let tokenPair = this._matchTokenPair(assetType, chainName, chainName, options);
    let chainType = this.tokenPairService.getChainType(chainName);
    let balance = await this.storemanService.getAccountBalance(tokenPair.id, chainType, account, options);
    balance = balance.toFixed();
    console.debug("SDK: getAccountBalance, result: %s", balance);
    return balance;
  }

  async estimateFee(assetType, fromChainName, toChainName, options = {}) {
    console.debug("SDK: estimateFee, assetType: %s, fromChainName: %s, toChainName: %s, options: %O", assetType, fromChainName, toChainName, options);
    let tokenPair = this._matchTokenPair(assetType, fromChainName, toChainName, options);
    let fromChainType = this.tokenPairService.getChainType(fromChainName);
    let toChainType = this.tokenPairService.getChainType(toChainName);
    let operateFee = await this.feesService.estimateOperationFee(tokenPair.id, fromChainType, toChainType);
    let networkFee = await this.feesService.estimateNetworkFee(tokenPair.id, fromChainType, toChainType, options);
    let fee = {
      operateFee: {value: operateFee.fee, unit: operateFee.unit, isRatio: operateFee.isRatio, min: operateFee.min, max: operateFee.max, decimals: operateFee.decimals},
      networkFee: {value: networkFee.fee, unit: networkFee.unit, isRatio: networkFee.isRatio, min: networkFee.min, max: networkFee.max, decimals: networkFee.decimals, isSubsidy: networkFee.isSubsidy}
    };
    console.debug("SDK: estimateFee, result: %O", fee);
    if (networkFee.isSubsidy && !options.includeSubsidyFee) {
      fee.networkFee.value = "0";
    }
    return fee;
  }

  async getQuota(assetType, fromChainName, toChainName, options = {}) {
    console.debug("SDK: getQuota, assetType: %s, fromChainName: %s, toChainName: %s, options: %O", assetType, fromChainName, toChainName, options);
    let quota;
    let protocol = options.protocol || "Erc20";
    if (protocol === "Erc20") {
      let tokenPair = this._matchTokenPair(assetType, fromChainName, toChainName, options);
      if (tokenPair.bridge) { // other bridge, such as Circle
        quota = {maxQuota: Infinity.toString(), minQuota: "0"};
      } else {
        let fromChainType = this.tokenPairService.getChainType(fromChainName);
        let smg = await this.getSmgInfo();
        quota = await this.storemanService.getStroremanGroupQuotaInfo(fromChainType, tokenPair.id, smg.id);
      }
    } else {
      quota = {maxQuota: MAX_NFT_BATCH_SIZE.toString(), minQuota: "0"};
    }
    console.debug("SDK: getQuota, result: %O", quota);
    return quota;
  }

  validateToAccount(chainName, account) {
    let chainType = this.tokenPairService.getChainType(chainName);
    let extension = this.configService.getExtension(chainType);
    if (this.stores.assetPairs.isTokenAccount(chainType, account, extension)) {
      console.error("SDK: validateToAccount, chainName: %s, account: %s, result: is token account", chainName, account);
      return false;
    }
    if (extension && extension.tool && extension.tool.validateAddress) {
      return extension.tool.validateAddress(account, this.network, chainName);
    } else if (["ETH", "BNB", "AVAX", "MOVR", "GLMR", "MATIC", "ARETH", "FTM", "OETH", "OKT", "CLV", "FX", "ASTR", "TLOS", "GTH"].includes(chainType)) {
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
    } else if ("XDC" === chainType) {
      return tool.isValidXdcAddress(account);
    } else {
      console.error("SDK: validateToAccount, chainName: %s, account: %s, result: unsupported chain", chainName, account);
      return false;
    }
  }

  validateXrpTokenAmount(amount) {
    return tool.validateXrpTokenAmount(amount);
  }

  async getNftInfo(assetType, chainName, account, options = {}) {
    console.debug("SDK: getNftInfo, assetType: %s, chainName: %s, account: %s, options: %O", assetType, chainName, account, options);
    let tokenPair = this._matchTokenPair(assetType, chainName, chainName, options);
    let token = (chainName === tokenPair.fromChainName)? tokenPair.fromAccount : tokenPair.toAccount;
    let chainType = this.tokenPairService.getChainType(chainName);
    let infos = await this.storemanService.getNftInfo(tokenPair.protocol, chainType, token, account, options);
    console.debug("SDK: getNftInfo, result: %O", infos);
    return infos;
  }

  getHistory(options = {}) {
    let history = [];
    let records = this.stores.crossChainTaskRecords;
    for (let [id, task] of records.ccTaskRecords) {
      if (((options.taskId === undefined) || (options.taskId == id)) && ((options.protocol === undefined) || (options.protocol === task.protocol))) {
        let item = {
          taskId: task.ccTaskId,
          pairId: task.assetPairId,
          timestamp: task.ccTaskId,
          asset: task.assetType,
          protocol: task.protocol,
          bridge: task.bridge,
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
        if (task.assetAlias) {
          item.assetAlias = task.assetAlias;
        }
        history.push(item);
        if (options.taskId !== undefined) { // only get one
          break;
        }
      }
    }
    console.debug("SDK: getHistory, options: %O, count: %d", options, history.length);
    return history;
  }

  async deleteHistory(options = {}) {
    let count = 0;
    let records = this.stores.crossChainTaskRecords;
    let ids = Array.from(records.ccTaskRecords.values())
      .filter(v => (((options.taskId === undefined) || (options.taskId == v.ccTaskId)) && ((options.protocol === undefined) || (options.protocol === v.protocol))))
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

  formatTokenAccount(chainName, tokenAccount) {
    let chainType = this.tokenPairService.getChainType(chainName);
    if (tokenAccount === "0x0000000000000000000000000000000000000000") {
      return chainType;
    }
    if (chainType === "XRP") {
      return tool.parseXrpTokenPairAccount(tokenAccount, true).join("."); // name.issuer
    } else if (chainType === "ADA") {
      let tokenInfo = tool.ascii2letter(tool.hexStrip0x(tokenAccount));
      let [policyId, name] = tokenInfo.split(".");
      return [policyId, tool.ascii2letter(name)].join("."); // policyId.name
    } else {
      return tool.getStandardAddressInfo(chainType, tokenAccount, this.configService.getExtension(chainType)).native;
    }
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
      let toChainType = ccTask.toChainType;
      let expectedToAccount = tool.getStandardAddressInfo(toChainType, ccTask.toAccount, this.configService.getExtension(toChainType)).native;
      let actualToAccount = tool.getStandardAddressInfo(toChainType, taskRedeemHash.toAccount, this.configService.getExtension(toChainType)).native;
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

  _onTaskStepResult(taskStepResult) { // only for async tx receipt
    console.debug("_onTaskStepResult: %O", taskStepResult);
    let taskId = taskStepResult.ccTaskId;
    let stepIndex = taskStepResult.stepIndex;
    let txHash = taskStepResult.txHash;
    let result = taskStepResult.result;
    let errInfo = taskStepResult.errInfo || "";
    let records = this.stores.crossChainTaskRecords;
    let ccTask = records.ccTaskRecords.get(taskId);
    if (ccTask) {
      this.stores.crossChainTaskRecords.finishTaskStep(taskId, stepIndex, txHash, result, errInfo);
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

  _matchTokenPair(assetType, fromChainName, toChainName, options = {}) {
    let protocol = options.protocol || "Erc20";
    let assetPairList = this.stores.assetPairs.assetPairList;
    for (let i = 0; i < assetPairList.length; i++) {
      let pair = assetPairList[i];
      if (((pair.assetAlias || pair.assetType) === assetType) && (pair.protocol === protocol) && (!options.assetPairId) || (options.assetPairId === pair.assetPairId)) {
        // if fromChainName and toChainName are the same, find any one of related pairs
        if ([pair.fromChainName, pair.toChainName].includes(fromChainName) && [pair.fromChainName, pair.toChainName].includes(toChainName)) {
          let tokenPair = this.tokenPairService.getTokenPair(pair.assetPairId);
          if (tokenPair) {
            return tokenPair;
          } else {
            console.error("tokenpair %s data is corrupted", pair.assetPairId);
            break;
          }
        }
      }
    }
    throw new Error("Asset pair not exist");
  }
}

module.exports = WanBridge;