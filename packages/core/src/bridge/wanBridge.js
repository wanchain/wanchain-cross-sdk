import { EventEmitter } from "events";
import CrossChainTaskRecords from "./stores/CrossChainTaskRecords.js";
import CrossChainTask from "./stores/CrossChainTask.js";
import AssetPairs from "./stores/AssetPairs.js";
import StartService from "../gsp/startService/startService.js";
import BridgeTask from "./bridgeTask.js";
import tool from "../utils/tool.js";
import BigNumber from "bignumber.js";
import axios from "axios";

const THIRD_PARTY_WALLET_CHAINS = ["BTC", "LTC", "DOGE", "XRP"];

// consistant with crosschain contract
const MAX_NFT_BATCH_SIZE = 10;

const TaskInfoMapping = { // for QuiX to insert task info
  "taskId": "ccTaskId",
  "pairId": "assetPairId",
  "asset": "assetType",
  "fromChain": "fromChainName",
  "toChain": "toChainName",
};

class WanBridge extends EventEmitter {
  constructor(network = "testnet", options = {}) {
    super();
    this.network = (network == "mainnet") ? "mainnet" : "testnet";
    this.isTestMode = options.isTestMode || false;
    this.smgName = options.smgName || "";
    this.prefer = options.prefer || "cctp"; // prefer cctp or wb when both tokenpair exist, default cctp
    this.stores = {
      crossChainTaskRecords: new CrossChainTaskRecords(),
      assetPairs: new AssetPairs(),
    };
  }

  async init(iwanAuth, options = {}) {
    console.debug("SDK: init, network: %s, isTestMode: %s, smgName: %s, prefer: %s, ver: 2604291730", this.network, this.isTestMode, this.smgName, this.prefer);
    try {
      this._service = new StartService();
      await this._service.init(this.network, this.stores, iwanAuth, Object.assign(options, { isTestMode: this.isTestMode, prefer: this.prefer }));
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
      this.eventService.addEventListener("ReadStoremanInfoComplete", this._onInitilized.bind(this)); // for token pair service to notify data ready
      this.eventService.addEventListener("LockTxHash", this._onLockTxHash.bind(this)); // for BTC/LTC/DOGE/XRP(thirdparty wallet) to notify lock txHash and sentAmount
      this.eventService.addEventListener("LockTxTimeout", this._onLockTxTimeout.bind(this)); // for BTC/LTC/DOGE/XRP to set lock tx timeout
      this.eventService.addEventListener("RedeemTxHash", this._onRedeemTxHash.bind(this)); // for all to notify redeem txHash
      this.eventService.addEventListener("TaskStepResult", this._onTaskStepResult.bind(this)); // for tx receipt service to update result
      this.eventService.addEventListener("Claimable", this._onClaimable.bind(this)); // for sc event service to notify cctp forward failed and claim Ready
      this.eventService.addEventListener("ClaimTxHash", this._onClaimTxHash.bind(this)); // for tx receipt service to notify claim result
      await this._service.start();
      return true;
    } catch (err) {
      this._onInitilized(false);
      return false;
    }
  }

  isReady() {
    return this.stores.assetPairs.isReady();
  }

  setCrossTypes(crossTypes) {
    let success = this.tokenPairService.setCrossTypes(crossTypes);
    console.debug("SDK: setCrossTypes %s: %O", success, crossTypes);
    return success;
  }

  getCrossTypes() {
    return this.tokenPairService.getCrossTypes();
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
    return Object.assign({}, smg, { changed });
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
    console.debug("SDK: checkWallet, chainName: %s, wallet: %s", chainName, wallet ? wallet.name : undefined);
    let chainType = this.tokenPairService.getChainType(chainName);
    if (this._isThirdPartyWallet(chainType) && !wallet) { // BTC support both
      return true;
    } else {
      return (await this.storemanService.checkWalletId(chainType, wallet, { debug: true }));
    }
  }

  async createTask(assetType, fromChainName, toChainName, amount, fromAccount, toAccount, options = {}) {
    console.debug("SDK: createTask at %s ms, assetType: %s, fromChainName: %s, toChainName: %s, amount: %O, fromAccount: %s, toAccount: %s, options: %O",
      tool.getCurTimestamp(), assetType, fromChainName, toChainName, amount, fromAccount, toAccount, this._getDebugOptions(options));
    if ((this.network === "testnet") && (this.smgName.indexOf("dev") !== 0)) {
      let devChains = ["Cosmos", "Kava", "Noble"];
      if (devChains.includes(fromChainName) || devChains.includes(toChainName)) {
        throw new Error("Only support dev group");
      }
    }
    let tokenPair = this._matchTokenPair(assetType, fromChainName, toChainName, options);
    let fromChainType = this.tokenPairService.getChainType(fromChainName);
    let wallet = options.wallet;
    // check fromAccount
    if (this._isThirdPartyWallet(fromChainType) && !wallet) {
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
    if (this._isThirdPartyWallet(fromChainType) && !wallet) {
      wallet = null;
    } else if (!wallet) {
      throw new Error("Missing wallet");
    }
    // create task
    let direction = (fromChainName === tokenPair.fromChainName) ? "MINT" : "BURN";
    let task = new BridgeTask(this, tokenPair, direction, fromAccount, toAccount, amount, wallet);
    await task.init(options);
    await task.start();
    return task;
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
    if (tokenPair.bridge === "Circle") {
      options.bridge = tokenPair.routes[0];
    }
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
        discount: operateFee.discount
      },
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
    if (operateFee.cctpForward) {
      fee.operateFee.cctpForward = operateFee.cctpForward;
    }
    if (networkFee.isSubsidy) {
      let chainInfo = this.chainInfoService.getChainInfoByType(fromChainType);
      let subsidyBalance = await this.storemanService.getAccountBalance(tokenPair.id, fromChainType, chainInfo.subsidyCrossSc, { isCoin: true });
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
      let chainType = (fromChainName === tokenPair.fromChainName) ? tokenPair.fromChainType : tokenPair.toChainType;
      let targetChainType = (fromChainName === tokenPair.fromChainName) ? tokenPair.toChainType : tokenPair.fromChainType;
      hideQuota = await this.iwan.call("getCrossChainTokenQuotaHiddenFlag", { chainType, targetChainType, tokenPairID: tokenPair.id });
      if (tokenPair.bridge) { // only Circle now, ingnore cctpV2 quota
        quota = { maxQuota: hideQuota ? "0" : Infinity, minQuota: "0" };
      } else {
        let smg = await this.getSmgInfo();
        quota = await this.storemanService.getStroremanGroupQuotaInfo(chainType, tokenPair.id, smg.id);
        if (hideQuota && (assetType !== "NIGHT")) {
          quota.maxQuota = "0";
        }
      }
    } else {
      quota = { maxQuota: MAX_NFT_BATCH_SIZE.toString(), minQuota: "0" };
    }
    console.debug("SDK: getQuota, hide: %s, result: %O", hideQuota, quota);
    return quota;
  }

  validateAddress(chainName, address, options = {}) { // validate address format and basic static rule
    options = Object.assign({ debug: true, checkToken: true }, options);
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

  async validateRecipient(chainName, address) { // it asynchronous because it relies on remote services
    let valid = this.validateAddress(chainName, address);
    if (valid) {
      if (chainName === "Cardano") { // cross swap
        valid = await this.storemanService.checkAdaRecipient(address);
      } else if (chainName === "Solana") { // system program
        valid = await this.storemanService.checkSolRecipient(address);
      }
    }
    if (valid === false) {
      console.log("SDK: validateRecipient, chainName: %s, address: %s, result: %s", chainName, address, valid);
    }
    return valid;
  }

  validateXrpTokenAmount(amount) {
    return tool.validateXrpTokenAmount(amount);
  }

  async getNftInfo(assetType, chainName, account, options = {}) {
    console.debug("SDK: getNftInfo, assetType: %s, chainName: %s, account: %s, options: %O", assetType, chainName, account, options);
    let tokenPair = this._matchTokenPair(assetType, chainName, chainName, options);
    let token = (chainName === tokenPair.fromChainName) ? tokenPair.fromAccount : tokenPair.toAccount;
    let chainType = this.tokenPairService.getChainType(chainName);
    // for cardano
    options.isNative = (chainType === tokenPair.fromChainType) ? tokenPair.fromIsNative : tokenPair.toIsNative;
    options.ancestorChainType = tokenPair.ancestorChainType; // mapping nft token
    options.ancestorAccount = tokenPair.ancestorAccount; // mapping nft token // mapping nft token
    // for cardano original nft token
    options.fromChainID = (chainType === tokenPair.fromChainType) ? tokenPair.fromChainID : tokenPair.toChainID; // original nft token
    options.toChainID = (chainType === tokenPair.fromChainType) ? tokenPair.toChainID : tokenPair.fromChainID; // original nft token
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
      return {
        taskId: task.ccTaskId,
        pairId: task.assetPairId,
        timestamp: task.ccTaskId,
        asset: task.assetType,
        assetAlias: task.assetAlias,
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
        errInfo: task.errInfo,
        wanPoints: task.wanPoints,
        // optional
        fromAccountId: task.fromAccountId || "",
        toAccountId: task.toAccountId || "",
        extend: task.extend,
        claimStatus: task.claimStatus,
        claimHash: task.claimHash,
      }
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

  async insertHistory(info) {
    let taskId = Date.now();
    console.debug("SDK: insertHistory, taskId: %d, bridge: %s, extent: %O", taskId, info.bridge, info.extend);
    let task = new CrossChainTask(taskId);
    let innerInfo = {};
    for (let k in info) {
      innerInfo[TaskInfoMapping[k] || k] = info[k];
    }
    task.setTaskData(innerInfo);
    this.stores.crossChainTaskRecords.addNewTradeTask(task.ccTaskData);
    await this.storageService.save("crossChainTaskRecords", taskId, task.ccTaskData);
    return taskId;
  }

  async updateHistory(info) {
    let records = this.stores.crossChainTaskRecords;
    let task = records.getTaskById(info.taskId);
    if (task) {
      let innerInfo = {};
      for (let k in info) {
        let innerKey = TaskInfoMapping[k] || k;
        if (task[innerKey] !== undefined) {
          innerInfo[innerKey] = info[k];
        }
      }
      records.setExtraInfo(info.taskId, innerInfo, true);
      await this.storageService.save("crossChainTaskRecords", info.taskId, task);
    } else {
      console.error("task %d is not exist", info.taskId);
    }
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
        if (name) { // erc20
          return [policyId, tool.ascii2letter(name)].join("."); // policyId.name
        } else { // nft
          return policyId; // policyId
        }
      } else if (chainType === "ALGO") {
        return Number(tokenAccount);
      } else if (["ATOM", "NOBLE", "KAVA", "SOL", "SUI", "TON"].includes(chainType)) { // ascii of name
        return tool.ascii2letter(tool.hexStrip0x(tokenAccount));
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

  async getChainAssets(options) { // options should contain wallet for most non-EVM chains
    console.debug("SDK: getChainAssets, options: %O", this._getDebugOptions(options));
    let ts0 = Date.now();
    let chains = options.chainNames || this.getFromChains(options);
    let prices = {};
    if (options.price && options.protocols.includes("Erc20")) {
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
    let result = (tokenPair.fromChainName === fromChainName) ? { from: from, to: to } : { from: to, to: from };
    result.bridge = tokenPair.bridge;
    result.routes = tokenPair.routes;
    return result;
  }

  async _getChainAssets(chainName, prices, options, startTime) {
    let chainType = this.tokenPairService.getChainType(chainName);
    let assets = this.tokenPairService.getChainAssets(chainType, options);
    // console.log("%s _getChainAssets assets: %O", chainName, assets);
    let balances = {}, assetInfos = [];
    try {
      if (options.account) {
        balances = await tool.timedPromise(this.storemanService.getAccountBalances(chainType, options.account, assets, options));
      }
    } catch (err) {
      console.log("%s _getChainAssets error: %O", chainName, err);
    }
    for (let asset in assets) {
      assetInfos.push({
        asset,
        symbol: assets[asset].symbol,
        address: this.formatTokenAccount(chainName, assets[asset].address),
        decimals: assets[asset].decimals,
        protocol: assets[asset].protocol,
        balance: balances[asset] || "",
        price: prices[asset] || "",
        highlightEndTime: assets[asset].highlightEndTime
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
    console.debug("SDK: checkAccountServiceInavailability %s, addresses: %O", isHacker, addresses);
    return isHacker;
  }

  getChainInfo(chainName) {
    let chainInfo = this.chainInfoService.getChainInfoByName(chainName);
    if (chainInfo) {
      let highlightEndTime = this.tokenPairService.getChainHighlightEndTime(chainInfo.chainId);
      return {
        chainName,
        bip44ChainId: chainInfo.chainId,
        symbol: chainInfo.symbol || chainInfo.chainType,
        chainId: chainInfo.walletChainId,
        blockTime: chainInfo.blockTime || 12,
        blockConfirmations: chainInfo.blockConfirmations || 1,
        highlightEndTime
      };
    }
    return null;
  }

  async claim(taskId, wallet) {
    let records = this.stores.crossChainTaskRecords;
    let task = records.getTaskById(taskId);
    if (!task) {
      throw new Error("Task does not exist");
    }
    if (["Processing", "Succeeded"].includes(task.claimStatus)) {
      throw new Error("Already claimed");
    }
    if (!["Ready", "Failed"].includes(task.claimStatus)) {
      throw new Error("Not ready");
    }
    let params;
    if ((task.fromChainType === "SOL") && (task.bridge === "Circle")) {
      let isV2 = task.stepData && task.stepData[0] && task.stepData[0].params && task.stepData[0].params.isV2;
      params = { taskType: "ProcessCircleBridgeSolanaReclaim", lockHash: task.lockHash, ccTaskId: taskId, fromAddr: task.fromAccount, isV2 };
      console.log("CircleBridgeSolanaReclaim params: %O", params);
      let addresses = await wallet.getAccounts();
      if ((addresses.length === 0) || (addresses[0] !== task.fromAccount)) {
        throw new Error("Invalid wallet account");
      }
    } else {
      throw new Error("Not claimable");
    }
    let err = await this.txTaskHandleService.processTxTask({ params }, wallet);
    if (err) {
      console.error("claim task %s error: %O", taskId, err);
      throw err;
    } else {
      this.stores.crossChainTaskRecords.setExtraInfo(taskId, { claimStatus: "Processing" }, true);
      this.storageService.save("crossChainTaskRecords", taskId, task);
    }
  }

  async getDiscounts() {
    let discounts = await this.iwan.getWanBridgeDiscounts();
    discounts.forEach(v => {
      v.amount = new BigNumber(v.amount).div(10 ** 18).toFixed();
      v.discount = new BigNumber(v.discount).div(10 ** 18).toFixed();
    });
    return discounts;
  }

  async accountAddress2Id(addresses) {
    let data = await this.iwan.call("getMultiAccountIdentity", { identityParams: addresses });
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
    let data = await this.iwan.call("getMultiAccountByIdentity", { identityParams: [id] });
    let result = [];
    let chainInfo = chainName ? this.chainInfoService.getChainInfoByName(chainName) : null;
    data.forEach(v => {
      let ci = this.chainInfoService.getChainInfoByType(v.chainType);
      if (ci) { // wanbridge support this chain
        if (chainName) {
          let checkFormat = this.validateAddress(chainName, v.account, { debug: false, checkToken: false });
          if (checkFormat) {
            if (ci.chainType === chainInfo.chainType) {
              result.unshift({ chainName: ci.chainName, address: v.account });
            } else {
              result.push({ chainName: ci.chainName, address: v.account });
            }
          }
        } else {
          result.push({ chainName: ci.chainName, address: v.account });
        }
      }
    });
    console.debug("SDK: accountId2Address, id: %s, chainName: %s, result: %O", id, chainName, result);
    return result;
  }

  async getRewardTasks(page, pageSize, options = {}) { // options: {claimer}
    console.debug("SDK: getRewardTasks, page: %d, pageSize: %d, options: %O", page, pageSize, options);
    try {
      let tasks = await this.storemanService.getRewardTasks(page, pageSize, options);
      return tasks;
    } catch (err) {
      console.error("getRewardTasks error: %O", err);
      throw err;
    }
  }

  async claimRewardTask(taskId, collateralId, fromAddr, wallet) {
    console.debug("SDK: claimRewardTask, taskId: %d, collateralId: %d, fromAddr: %s, wallet: %s", taskId, collateralId, fromAddr, wallet && wallet.name);
    let task = await this.storemanService.getRewardTask(taskId);
    if (task) {
      if (task.status !== 1) { // Created
        throw new Error("Task is not available");
      }
    } else {
      throw new Error("Task does not exist");
    }
    // build tx
    let collateral = task.collateral[collateralId];
    let convert = {
      taskId,
      collateralId,
      token: collateral.token,
      amount: collateral.amount,
      fromAddr,
      handler: "ClaimRewardTask"
    };
    // console.log("claimRewardTask convert: %O", convert);
    let steps = await this.cctHandleService.getConvertInfo(convert);
    for (let i = 0; i < steps.length; i++) {
      let err = await this.txTaskHandleService.processTxTask(steps[i], wallet);
      if (err) {
        console.error("claimRewardTask %s %s error: %O", taskId, steps[i].name, err);
        throw err;
      }
    }
  }

  async claimCrossReward(taskId, txHash, fromAddr, wallet) {
    console.debug("SDK: claimCrossReward, taskId: %d, txHash: %s, fromAddr: %s, wallet: %s", taskId, txHash, fromAddr, wallet && wallet.name);
    let task = await this.storemanService.getRewardTask(taskId);
    if (task) {
      if (task.status === 1) { // Created
        throw new Error("Task is not claimed");
      } else if (task.status === 3) { // Completed
        throw new Error("Task reward has been claimed");
      } else if (task.status !== 2) { // InProgress
        throw new Error("Task is not available");
      }
    } else {
      throw new Error("Task does not exist");
    }
    let url = (this.network === "testnet") ? "https://testnet.wanscan.org/api/sign" : "https://www.wanscan.org/api/sign";
    let res = await axios.post(url, { type: "ccRewardTask", taskId, txHash });
    if (res.data.signature) {
      let params = { taskType: "ProcessClaimCrossReward", taskId, txHash, signature: res.data.signature, fromAddr, wallet };
      let err = await this.txTaskHandleService.processTxTask({ params }, wallet);
      if (err) {
        console.error("claimCrossReward task %s error: %O", taskId, err);
        throw err;
      }
    } else {
      console.error("claimCrossReward task %s signature error: %s", taskId, res.data.error);
      throw new Error(res.data.error);
    }
  }

  _onInitilized(success) {
    if (success) {
      let assetPairList = this.stores.assetPairs.assetPairList;
      this._distributeEvent("ready", assetPairList.map(v => Object.assign({}, v)));
      console.debug("WanBridge is ready for %d assetPairs and %d smgs", assetPairList.length, this.stores.assetPairs.smgList.length);
    } else {
      this._distributeEvent("error", { reason: "Failed to initialize" });
      console.error("WanBridge has error");
    }
  }

  async _onLockTxHash(taskLockHash) { // only for third-party wallet lockTx to update txHash and result
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
      console.error({ taskId, errInfo });
      records.modifyTradeTaskStatus(taskId, "Failed", errInfo);
      this._distributeEvent("error", { taskId, reason: errInfo });
    } else {
      records.modifyTradeTaskStatus(taskId, "Converting");
    }
    records.setTaskLockTxHash(taskId, txHash, value, taskLockHash.sender, taskLockHash.uniqueId);
    this.storageService.save("crossChainTaskRecords", taskId, ccTask);
    await this._distributeEvent("lock", { taskId, txHash });
    this._distributeEvent("locked", { taskId, txHash });
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
      this._distributeEvent("error", { taskId, reason: errInfo });
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
      let isMatch;
      let toChainType = ccTask.toChainType;
      if (toChainType === "TON") {
        let tonTool = this.configService.getExtension(toChainType).tool;
        isMatch = tonTool.parseAddress(taskRedeemHash.toAccount).equals(tonTool.parseAddress(ccTask.toAccount));
      } else {
        try {
          let expectedToAccount = tool.getStandardAddressInfo(toChainType, ccTask.innerToAccount || ccTask.toAccount, this.configService.getExtension(toChainType)).native;
          let actualToAccount = tool.getStandardAddressInfo(toChainType, taskRedeemHash.toAccount, this.configService.getExtension(toChainType)).native;
          isMatch = tool.cmpAddress(expectedToAccount, actualToAccount);
        } catch (err) {
          console.error("_onRedeemTxHash %s getStandardAddressInfo error: %O", toChainType, err);
          isMatch = false;
        }
      }
      if (!isMatch) {
        console.error("actual toAccount %s does not match expected toAccount %s", taskRedeemHash.toAccount, ccTask.innerToAccount || ccTask.toAccount);
        status = "Error";
        errInfo = "Please contact the Wanchain Foundation (techsupport@wanchain.org)";
        this._distributeEvent("error", { taskId, reason: errInfo });
      }
    }
    let receivedAmount;
    if (ccTask.protocol === "Erc20") {
      let sentAmount = ccTask.sentAmount || ccTask.amount;
      let fee = tool.parseFee(ccTask.fee, sentAmount, ccTask.assetType);
      let expected = new BigNumber(sentAmount).minus(fee).toFixed();
      if (taskRedeemHash.value) {
        receivedAmount = new BigNumber(taskRedeemHash.value).div(Math.pow(10, ccTask.toDecimals)).toFixed();
        if (receivedAmount !== expected) {
          let actualFee = BigNumber.max(new BigNumber(sentAmount).minus(receivedAmount), 0).toFixed();
          this._updateFee(taskId, ccTask.fee, ccTask.assetType, fee, actualFee);
        }
      } else {
        receivedAmount = expected;
      }
    } else {
      receivedAmount = ccTask.amount;
    }
    records.modifyTradeTaskStatus(taskId, status, errInfo);
    records.setTaskRedeemTxHash(taskId, txHash, receivedAmount);
    if (ccTask.bridge === "Circle") {
      if (ccTask.fromChainType === "SOL") { // set claimStatus to Ready, to claim cctp event data account, regardless of claim usdc status
        records.setExtraInfo(taskId, { claimStatus: "Ready" }, true);
      } else if (ccTask.claimStatus) { // claim cctp usdc is via thirdparty tool, just clear claim status
        records.setExtraInfo(taskId, { claimStatus: "" }, true);
      }
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
      records.setExtraInfo(taskId, { wanPoints });
    } else {
      console.debug("%s does not support wanPoints", this.network);
    }
    this.storageService.save("crossChainTaskRecords", taskId, ccTask);
    this._distributeEvent("redeem", { taskId, txHash });
  }

  _updateFee(taskId, taskFee, assetType, estimateFee, actualFee) {
    let records = this.stores.crossChainTaskRecords;
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
        records.updateTaskFee(taskId, "networkFee", actualFee);
        if (taskFee.operateFee.unit === assetType) {
          records.updateTaskFee(taskId, "operateFee", "0");
        }
      } else {
        records.updateTaskFee(taskId, "operateFee", actualFee);
        if (taskFee.networkFee.unit === assetType) {
          records.updateTaskFee(taskId, "networkFee", "0");
        }
      }
      console.debug("SDK: update task %d %s fee: %s->%s %s", taskId, feeType, estimateFee, actualFee, assetType);
    } else {
      console.error("SDK: can't update task %d fee: %s->%s %s", taskId, estimateFee, actualFee, assetType);
    }
  }

  async _onTaskStepResult(taskStepResult) { // both for sync error, sync txHash, async tx receipt
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
      let { isLockTx, isLocked } = records.updateTaskByStepResult(taskId, stepIndex, txHash, result, errInfo);
      if (["Failed", "Rejected"].includes(result)) {
        this._distributeEvent("error", { taskId, reason: errInfo || result });
      } else {
        if (isLockTx) {
          await this._distributeEvent("lock", { taskId, txHash });
        }
        if (isLocked) {
          this._distributeEvent("locked", { taskId, txHash });
        }
      }
      this.storageService.save("crossChainTaskRecords", taskId, ccTask);
    }
  }

  _onClaimable(taskClaimable) {
    console.debug("_onClaimable: %O", taskClaimable);
    let taskId = taskClaimable.ccTaskId;
    let records = this.stores.crossChainTaskRecords;
    let ccTask = records.ccTaskRecords.get(taskId);
    if (ccTask && (ccTask.status === "Converting")) {
      this.stores.crossChainTaskRecords.setExtraInfo(taskId, { claimStatus: "Ready" });
      this.storageService.save("crossChainTaskRecords", taskId, ccTask);
    }
  }

  _onClaimTxHash(taskClaimHash) {
    console.debug("_onClaimTxHash: %O", taskClaimHash);
    let taskId = taskClaimHash.ccTaskId;
    let txHash = taskClaimHash.txHash;
    let result = taskClaimHash.result; // Succeeded / Failed
    let errInfo = taskClaimHash.errInfo || "";
    let records = this.stores.crossChainTaskRecords;
    let ccTask = records.ccTaskRecords.get(taskId);
    if (ccTask) {
      this.stores.crossChainTaskRecords.setExtraInfo(taskId, { claimStatus: result, claimHash: txHash }, true);
      if (errInfo) {
        let event = { taskId, txHash, reason: "claim failed" };
        this._distributeEvent("error", event);
      } else {
        let event = { taskId, txHash };
        this._distributeEvent("claim", event);
      }
      this.storageService.save("crossChainTaskRecords", taskId, ccTask);
    }
  }

  async _distributeEvent(name, data) {
    this.emit(name, data);
    if (name === "lock") {
      await this._registerTxOperator(data.txHash);
    }
    console.debug("_distributeEvent %s: %O", name, data);
  }

  async _registerTxOperator(txHash) {
    let host = (this.network === "mainnet") ? "https://www.wanscan.org" : "https://testnet.wanscan.org";
    let operator = this.isTestMode ? "WanBridgePre" : "WanBridge";
    let data = { txHash, operator };
    try {
      let result = await axios.post(host + '/api/cc/tx/operator', data);
      if (result.data.operator !== operator) {
        throw new Error("data error");
      }
    } catch (err) {
      console.error("registerOperator %O error: %O", data, err);
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

export default WanBridge;
