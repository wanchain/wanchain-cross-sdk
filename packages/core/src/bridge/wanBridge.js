const EventEmitter = require('events').EventEmitter;
const CrossChainTaskRecords = require('./stores/CrossChainTaskRecords');
const AssetPairs = require('./stores/AssetPairs');
const StartService = require('../gsp/startService/startService.js');
const BridgeTask = require('./bridgeTask.js');
const tool = require('../utils/tool.js');
const BigNumber = require("bignumber.js");
const axios = require("axios");

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
    console.debug("SDK: init, network: %s, isTestMode: %s, smgName: %s, ver: 2409041025", this.network, this.isTestMode, this.smgName);
    this._service = new StartService();
    await this._service.init(this.network, this.stores, iwanAuth, Object.assign(options, {isTestMode: this.isTestMode}));
    this.configService = this._service.getService("ConfigService");
    this.eventService = this._service.getService("EventService");
    this.storemanService = this._service.getService("StoremanService");
    this.storageService = this._service.getService("StorageService");
    this.feesService = this._service.getService("CrossChainFeesService");
    this.chainInfoService = this._service.getService("ChainInfoService");
    this.tokenPairService = this._service.getService("TokenPairService");
    this.txTaskHandleService = this._service.getService("TxTaskHandleService");
    this.cctHandleService = this._service.getService("CCTHandleService");
    this.iwan = this._service.getService("iWanConnectorService");
    this.eventService.addEventListener("ReadStoremanInfoComplete", this._onStoremanInitilized.bind(this)); // for token pair service to notify data ready
    this.eventService.addEventListener("LockTxHash", this._onLockTxHash.bind(this)); // for BTC/LTC/DOGE/XRP(thirdparty wallet) to notify lock txHash and sentAmount
    this.eventService.addEventListener("LockTxTimeout", this._onLockTxTimeout.bind(this)); // for BTC/LTC/DOGE/XRP to set lock tx timeout
    this.eventService.addEventListener("RedeemTxHash", this._onRedeemTxHash.bind(this)); // for all to notify redeem txHash
    this.eventService.addEventListener("TaskStepResult", this._onTaskStepResult.bind(this)); // for tx receipt service to update result
    this.eventService.addEventListener("ReclaimTxHash", this._onReclaimTxHash.bind(this)); // for tx receipt service to notify reclaim result
    await this._service.start();
  }

  isReady() {
    return this.stores.assetPairs.isReady();
  }

  setCrossTypes(crossTypes) {
    let success = this.tokenPairService.setCrossTypes(crossTypes);
    console.debug("SDK: setCrossTypes %s: %O", success, crossTypes);
    return success;
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
      if (chainInfo.MaskChainId !== undefined) {
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
    console.debug("SDK: createTask at %s ms, assetType: %s, fromChainName: %s, toChainName: %s, amount: %O, fromAccount: %s, toAccount: %s, options: %O",
                  tool.getCurTimestamp(), assetType, fromChainName, toChainName, amount, fromAccount, toAccount, this._getDebugOptions(options));
    if ((this.network === "testnet") && (this.smgName.indexOf("dev") !== 0)) {
      let devChains = ["Cardano", "Cosmos"];
      if (devChains.includes(fromChainName) || devChains.includes(toChainName)) {
        throw new Error("Dev group only");
      }
    }
    let tokenPair = this._matchTokenPair(assetType, fromChainName, toChainName, options);
    let fromChainType = this.tokenPairService.getChainType(fromChainName);
    // check fromAccount
    if (this._isThirdPartyWallet(fromChainType)) {
      fromAccount = "";
    } else if (fromAccount) {
      if (!this.validateAddress(fromChainName, fromAccount)) {
        throw new Error("Invalid fromAccount");
      }
    } else {
      throw new Error("Missing fromAccount");
    }
    // check toAccount
    if (!(toAccount && this.validateAddress(toChainName, toAccount))) {
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
    await task.init(options);
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
    console.debug("SDK: getAccountBalance, assetType: %s, chainName: %s, account: %s, options: %O", assetType, chainName, account, this._getDebugOptions(options));
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
    let [operateFee, networkFee] = await Promise.all([
      this.feesService.estimateOperationFee(tokenPair.id, fromChainType, toChainType, options),
      this.feesService.estimateNetworkFee(tokenPair.id, fromChainType, toChainType, options)
    ]);
    let prices = await this.tokenPairService.getAssetPrice([operateFee.unit, networkFee.unit]);
    let fee = {
      operateFee: {
        value: operateFee.fee,
        unit: operateFee.unit,
        price: prices[operateFee.unit] || "",
        isRatio: operateFee.isRatio,
        min: operateFee.min,
        max: operateFee.max,
        decimals: operateFee.decimals,
        discount: operateFee.discount},
      networkFee: {
        value: networkFee.fee,
        unit: networkFee.unit,
        price: prices[networkFee.unit] || "",
        isRatio: networkFee.isRatio,
        min: networkFee.min,
        max: networkFee.max,
        decimals: networkFee.decimals,
        discount: networkFee.discount,
        isSubsidy: networkFee.isSubsidy
      }
    };
    if (networkFee.isSubsidy) {
      let chainInfo = this.chainInfoService.getChainInfoByType(fromChainType);
      let subsidyBalance = await this.storemanService.getAccountBalance(tokenPair.id, fromChainType, chainInfo.subsidyCrossSc, {isCoin: true});
      fee.networkFee.subsidyBalance = subsidyBalance.toFixed();
    }
    console.debug("SDK: estimateFee, result: %O", fee);
    return fee;
  }

  async getQuota(assetType, fromChainName, toChainName, options = {}) {
    console.debug("SDK: getQuota, assetType: %s, fromChainName: %s, toChainName: %s, options: %O", assetType, fromChainName, toChainName, options);
    let quota, hideQuota = false;
    let protocol = options.protocol || "Erc20";
    if (protocol === "Erc20") {
      let tokenPair = this._matchTokenPair(assetType, fromChainName, toChainName, options);
      let fromChainID = (fromChainName === tokenPair.fromChainName)? tokenPair.fromChainID : tokenPair.toChainID;
      let toChainID = (fromChainName === tokenPair.fromChainName)? tokenPair.toChainID : tokenPair.fromChainID;
      let hideQuotaChains = await this.iwan.getChainQuotaHiddenFlagDirectionally([fromChainID, toChainID]);
      if (hideQuotaChains) {
        if (hideQuotaChains[fromChainID] && (hideQuotaChains[fromChainID].hiddenSourceChainQuota === true)) {
          hideQuota = true;
        } else if (hideQuotaChains[toChainID] && (hideQuotaChains[toChainID].hiddenTargetChainQuota === true)) {
          hideQuota = true;
        }
      }
      if (tokenPair.bridge) { // other bridge, such as Circle
        quota = {maxQuota: hideQuota? "0" : Infinity.toString(), minQuota: "0"};
      } else {
        let fromChainType = this.tokenPairService.getChainType(fromChainName);
        let smg = await this.getSmgInfo();
        quota = await this.storemanService.getStroremanGroupQuotaInfo(fromChainType, tokenPair.id, smg.id);
        if (hideQuota) {
          quota.maxQuota = "0";
        }
      }
    } else {
      quota = {maxQuota: MAX_NFT_BATCH_SIZE.toString(), minQuota: "0"};
    }
    console.debug("SDK: getQuota, hide: %s, result: %O", hideQuota, quota);
    return quota;
  }

  validateAddress(chainName, address, options = {}) {
    options = Object.assign({debug: true, checkToken: true}, options);
    let chainType = this.tokenPairService.getChainType(chainName);
    let result = this.storemanService.validateAddress(chainType, address);
    if (result === false) {
      if (options.debug) {
        console.log("SDK: validateAddress, chainName: %s, address: %s, result: %s", chainName, address, result);
      }
      return false;
    }
    let extension = this.configService.getExtension(chainType);
    if (options.checkToken && this.stores.assetPairs.isTokenAccount(chainType, address, extension)) {
      console.error("SDK: validateAddress, chainName: %s, address: %s, result: is token address", chainName, address);
      return false;
    }
    return true;
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
    infos.forEach(v => {
      v.ancestorChainName = tokenPair.ancestorChainName; // frontend show ancestorChainName
      v.ancestorChainType = tokenPair.ancestorChainType; // frontend get icon
    });
    console.debug("SDK: getNftInfo, result: %O", infos);
    return infos;
  }

  getHistoryNumber(options) {
    let records = this.stores.crossChainTaskRecords;
    let number = records.getTaskNumber(options.protocols);
    console.debug("SDK: getHistoryNumber, options: %O, number: %O", options, number);
    return number;
  }

  getHistory(options = {}) {
    let all = [];
    let records = this.stores.crossChainTaskRecords;
    if (options.taskId) { // single
      let task = records.getTaskById(options.taskId);
      if (task) {
        all.push(task);
      }
    } else if ((options.page !== undefined) && options.number) { // page
      all = records.getTaskByPage(options.page, options.number, options.protocols);
    }
    let history = all.map(task => {
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
        reclaimStatus: task.reclaimStatus,
        reclaimHash: task.reclaimHash,
        errInfo: task.errInfo,
        wanPoints: task.wanPoints,
        fromAccountId: task.fromAccountId,
        toAccountId: task.toAccountId,
      };
      if (task.assetAlias) {
        item.assetAlias = task.assetAlias;
      }
      return item;
    });
    console.debug("SDK: getHistory, options: %O, count: %O", options, history);
    return history;
  }

  async deleteHistory(options = {}) {
    let count = 0;
    let records = this.stores.crossChainTaskRecords;
    let delIdSet = new Set(options.taskIds);
    let ids = Array.from(records.ccTaskRecords.values())
      .filter(v => (((delIdSet.size === 0) || delIdSet.has(v.ccTaskId)) && ((options.protocols === undefined) || (options.protocols.includes(v.protocol)))))
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
    try {
      if (tokenAccount === "0x0000000000000000000000000000000000000000") {
        return tokenAccount;
      }
      let chainType = this.tokenPairService.getChainType(chainName);
      if (chainType === "XRP") {
        return tool.parseXrpTokenPairAccount(tokenAccount, true).join("."); // name.issuer
      } else if (chainType === "ADA") {
        let tokenInfo = tool.ascii2letter(tool.hexStrip0x(tokenAccount));
        let [policyId, name] = tokenInfo.split(".");
        return [policyId, tool.ascii2letter(name)].join("."); // policyId.name
      } else if (chainType === "SOL") {
        return tool.ascii2letter(tool.hexStrip0x(tokenAccount));
      } else if (chainType === "ALGO") {
        return Number(tokenAccount);
      } else {
        return tool.getStandardAddressInfo(chainType, tokenAccount, this.configService.getExtension(chainType)).native;
      }
    } catch (err) {
      console.error("SDK: formatTokenAccount, chainName: %s, tokenAccount: %s, error: %O", chainName, tokenAccount, err);
      return tokenAccount;
    }
  }

  getFromChains(options) { // options MUST contain protocols
    let fromChainSet = new Set();
    let assetPairList = this.stores.assetPairs.assetPairList;
    for (let pair of assetPairList) {
      if (options.protocols.includes(pair.protocol)) {
        if (pair.direction === "both") {
          fromChainSet.add(pair.fromChainName);
          fromChainSet.add(pair.toChainName);
        } else if (pair.direction === "f2t") {
          fromChainSet.add(pair.fromChainName);
        } else { // t2f
          fromChainSet.add(pair.toChainName);
        }
      }
    }
    return Array.from(fromChainSet);
  }

  async getChainAssets(options) { // options should contain wallet for non-EVM chain
    let ts0 = Date.now();
    let chains = options.chainNames || this.getFromChains(options);
    let prices = {};
    if (options.account && options.protocols.includes("Erc20")) {
      let assetNameSet = new Set();
      let assetPairList = this.stores.assetPairs.assetPairList;
      assetPairList.forEach(pair => {
        if (options.protocols.includes(pair.protocol)) {
          if (chains.includes(pair.fromChainName) || chains.includes(pair.toChainName)) {
            assetNameSet.add(pair.assetAlias || pair.assetType);
          }
        }
      });
      prices = await this.tokenPairService.getAssetPrice(Array.from(assetNameSet));
      // console.log("getChainAssets prices: %O", prices);
    }
    let ts1 = Date.now();
    console.debug("getAssetPrice consume %s ms", ts1 - ts0);
    let assetInfos = await Promise.all(chains.map(chain => this._getChainAssets(chain, prices, options, ts1)));
    let result = {};
    chains.forEach((v, i) => result[v] = assetInfos[i]);
    let ts2 = Date.now();
    console.debug("getChainAssets consume %s ms", ts2 - ts0);
    return result;
  }

  getToChains(assetType, fromChainName, options) { // options MUST contain protocols
    let toChainSet = new Set();
    let assetPairList = this.stores.assetPairs.assetPairList;
    for (let pair of assetPairList) {
      if (((pair.assetAlias || pair.assetType) === assetType) && options.protocols.includes(pair.protocol)) {
        if (pair.fromChainName === fromChainName) {
          if (["both", "f2t"].includes(pair.direction)) {
            toChainSet.add(pair.toChainName);
          }
        }
        if (pair.toChainName === fromChainName) {
          if (["both", "t2f"].includes(pair.direction)) {
            toChainSet.add(pair.fromChainName);
          }
        }
      }
    }
    return Array.from(toChainSet);
  }

  getAssetPairInfo(assetType, fromChainName, toChainName, options) {
    let tokenPair = this._matchTokenPair(assetType, fromChainName, toChainName, options);
    let from = {
      chain: tokenPair.fromChainName,
      symbol: tokenPair.fromSymbol,
      address: this.formatTokenAccount(tokenPair.fromChainName, tokenPair.fromAccount),
      decimals: tokenPair.fromDecimals,
      isNative: tokenPair.fromIsNative,
      issuer: tokenPair.fromIssuer
    };
    let to = {
      chain: tokenPair.toChainName,
      symbol: tokenPair.toSymbol,
      address: this.formatTokenAccount(tokenPair.toChainName, tokenPair.toAccount),
      decimals: tokenPair.toDecimals,
      isNative: tokenPair.toIsNative,
      issuer: tokenPair.toIssuer
    };
    let result = (tokenPair.fromChainName === fromChainName)? {from: from, to: to} : {from: to, to: from};
    result.bridge = tokenPair.bridge;
    return result;
  }

  async _getChainAssets(chainName, prices, options, startTime) {
    let chainType = this.tokenPairService.getChainType(chainName);
    let assets = this.tokenPairService.getChainAssets(chainType, options);
    // console.log("_getChainAssets assets: %O", assets);
    let balances = {}, assetInfos = [];
    try {
      if (options.account) {
        balances = await tool.timedPromise(this.storemanService.getAccountBalances(chainType, options.account, assets, options));
      }
    } catch (err) {
      console.error("%s _getChainAssets error: %O", chainName, err);
    }
    for (let asset in assets) {
      assetInfos.push({
        asset,
        symbol: assets[asset].symbol,
        address: this.formatTokenAccount(chainName, assets[asset].address),
        decimals: assets[asset].decimals,
        protocol: assets[asset].protocol,
        balance: balances[asset] || "",
        price: prices[asset] || ""
      });
    }
    let time = Date.now() - startTime;
    if (time >= 3000) {
      console.debug("%s _getChainAssets %O consume %s ms", chainName, options, time);
    }
    return assetInfos;
  }

  async checkHackerAccount(addresses) {
    let isHacker = await this.iwan.hasHackerAccount(addresses);
    if (isHacker) {
      console.debug("SDK: checkAccountServiceInavailability true, addresses: %O", addresses);
    }
    return isHacker;
  }

  async getChainInfo(chainName) {
    let chainInfo = this.chainInfoService.getChainInfoByName(chainName);
    if (chainInfo) {
      return {
        chainName,
        symbol: chainInfo.symbol || chainInfo.chainType,
        chainId: chainInfo.MaskChainId
      }
    }
    return null;
  }

  async reclaim(taskId, wallet) {
    let records = this.stores.crossChainTaskRecords;
    let task = records.getTaskById(taskId);
    if (!task) {
      throw new Error("Task does not exist");
    }
    if (["Processing", "Succeeded"].includes(task.reclaimStatus)) {
      throw new Error("Already reclaimed");
    }
    if (!["Ready", "Failed"].includes(task.reclaimStatus)) {
      throw new Error("Not ready");
    }
    let taskType = "";
    if ((task.fromChainType === "SOL") && (task.bridge === "Circle")) {
      taskType = "ProcessCircleBridgeSolanaReclaim";
    } else {
      throw new Error("Not reclaimable");
    }
    let addresses = await wallet.getAccounts();
    if ((addresses.length === 0) || (addresses[0] !== task.fromAccount)) {
      throw new Error("Invalid wallet account");
    }
    let params = {taskType, lockHash: task.lockHash, ccTaskId: taskId};
    let err = await this.txTaskHandleService.processTxTask({params}, wallet);
    if (err) {
      console.error("reclaim task %s error: %O", taskId, err);
      throw err;
    } else {
      this.stores.crossChainTaskRecords.setExtraInfo(taskId, {reclaimStatus: "Processing"}, true);
      this.storageService.save("crossChainTaskRecords", taskId, task);
    }
  }

  async getDiscounts() {
    let discounts = await this.iwan.getWanBridgeDiscounts();
    discounts.forEach(v => {
      v.amount = new BigNumber(v.amount).div(10 ** 18).toFixed();
      v.discount = new BigNumber(v.discount).div(10 ** 18).toFixed();
    })
    return discounts;
  }

  async accountAddress2Id(addresses) {
    let data = await this.iwan.call("getMultiAccountIdentity", {identityParams: addresses});
    let result = {};
    data.forEach(v => {
      if (v.id) {
        result[v.account] = v.id;
      }
    });
    console.debug("SDK: accountAddress2Id, addresses: %O, result: %O", addresses, result);
    return result;
  }

  async accountId2Address(id, chainName) {
    let data = await this.iwan.call("getMultiAccountByIdentity", {identityParams:[id]});
    let result = [];
    let chainInfo = chainName? this.chainInfoService.getChainInfoByName(chainName) : null;
    data.forEach(v => {
      let ci = this.chainInfoService.getChainInfoByType(v.chainType);
      if (ci) { // wanbridge support this chain
        if (chainName) {
          let checkFormat = this.validateAddress(chainName, v.account, {debug: false, checkToken: false});
          if (checkFormat) {
            if (ci.chainType === chainInfo.chainType) {
              result.unshift({chainName: ci.chainName, address: v.account});
            } else {
              result.push({chainName: ci.chainName, address: v.account});
            }
          }
        } else {
          result.push({chainName: ci.chainName, address: v.account});
        }
      }
    });
    console.debug("SDK: accountId2Address, id: %s, chainName: %s, result: %O", id, chainName, result);
    return result;
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

  _onLockTxHash(taskLockHash) { // only for third-party wallet lockTx to update txHash and result
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
    this.emit("locked", {taskId, txHash});
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

  async _onRedeemTxHash(taskRedeemHash) {
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
    if (taskRedeemHash.toAccount) {
      let toChainType = ccTask.toChainType;
      let expectedToAccount = tool.getStandardAddressInfo(toChainType, ccTask.innerToAccount || ccTask.toAccount, this.configService.getExtension(toChainType)).native;
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
    if ((ccTask.fromChainType === "SOL") && (ccTask.bridge === "Circle")) {
      records.setExtraInfo(taskId, {reclaimStatus: "Ready"});
    }
    let wanPointsServer = this.configService.getGlobalConfig("wanPointsServer");
    if (wanPointsServer) {
      let wanPoints = '0';
      let url = wanPointsServer + "/api/point/" + ccTask.lockHash;
      try {
        let res = await axios.get(url);
        console.debug("wanPoints %s: %O", url, res);
        if (res && res.data && res.data.point) {
          wanPoints = new BigNumber(res.data.point).toFixed();
        }
      } catch (err) {
        console.debug("wanPoints %s error: %O", url, err);
      }
      records.setExtraInfo(taskId, {wanPoints});
    } else {
      console.debug("%s does not support wanPoints", this.network);
    }
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

  _onTaskStepResult(taskStepResult) { // only for async tx receipt to update lockTx result
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
      let {isLockTx, isLocked} = records.updateTaskByStepResult(taskId, stepIndex, txHash, result, errInfo);
      if (isLockTx) {
        let lockEvent = {taskId, txHash};
        console.debug("lockEvent: %O", lockEvent);
        this.emit("lock", lockEvent);
      }
      if (isLocked) {
        let lockedEvent = {taskId, txHash};
        console.debug("lockedEvent: %O", lockedEvent);
        this.emit("locked", lockedEvent);
      }
      this.storageService.save("crossChainTaskRecords", taskId, ccTask);
    }
  }

  _onReclaimTxHash(taskReclaimHash) {
    console.debug("_onReclaimTxHash: %O", taskReclaimHash);
    let taskId = taskReclaimHash.ccTaskId;
    let txHash = taskReclaimHash.txHash;
    let result = taskReclaimHash.result; // Succeeded / Failed
    let errInfo = taskReclaimHash.errInfo || "";
    let records = this.stores.crossChainTaskRecords;
    let ccTask = records.ccTaskRecords.get(taskId);
    if (ccTask) {
      this.stores.crossChainTaskRecords.setExtraInfo(taskId, {reclaimStatus: result, reclaimHash: txHash}, true);
      if (errInfo) {
        let event = {taskId, txHash, reason: "Reclaim failed"};
        console.error("reclaimEvent: %O", event);
        this.emit("error", event);
      } else {
        let event = {taskId, txHash};
        console.debug("reclaimEvent: %O", event);
        this.emit("reclaim", event);
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
      // sometimes there are temporary two bridges for the same asset crosschain, need to be specified by assetPairId
      if (((pair.assetAlias || pair.assetType) === assetType) && (pair.protocol === protocol) && ((!options.assetPairId) || (options.assetPairId === pair.assetPairId))) {
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

  _getDebugOptions(options) {
    let opt = Object.assign({}, options);
    // only display wallet name
    if (opt.wallet) {
      opt.wallet = opt.wallet.name;
    }
    return opt;
  }
}

module.exports = WanBridge;