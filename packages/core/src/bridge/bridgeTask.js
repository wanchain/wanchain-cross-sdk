import tool from "../utils/tool.js";
import * as keypairs from "ripple-keypairs";
import * as elliptic from "elliptic";
import * as xrpAddrCodec from "ripple-address-codec";
import CrossChainTask from "./stores/CrossChainTask.js";
import BigNumber from "bignumber.js";
import util from "util";

const Secp256k1 = elliptic.ec('secp256k1');

const MAX_NFT_BATCH_SIZE = 10; // consistant with crosschain contract

const gpkAlgs = {
  ecdsa: 0,
  schnorr: 1,
  schnorr340: 2,
  ed25519: 3,
};

const gpkCurves = {
  secp256: 0,
  bn256: 1,
  ed25519: 2,
};

class BridgeTask {
  constructor(bridge, tokenPair, direction, fromAccount, toAccount, amount, wallet) {
    this.id = Date.now();
    this._bridge = bridge;
    this._tokenPair = tokenPair;
    this._direction = direction;
    this._fromAccount = fromAccount;
    this._toAccount = toAccount;
    if (tokenPair.protocol === "Erc20") {
      this._amount = new BigNumber(amount).toFixed();
    } else {
      if (amount.length > MAX_NFT_BATCH_SIZE) {
        throw new Error("Max NFT batch size is " + MAX_NFT_BATCH_SIZE);
      }
      this._amount = amount;
    }
    this._wallet = wallet;
    let fromChainInfo = {
      symbol: tokenPair.fromSymbol,
      decimals: tokenPair.fromDecimals,
      chainType: bridge.tokenPairService.getChainType(tokenPair.fromChainName),
      chainName: tokenPair.fromChainName
    };
    let toChainInfo = {
      symbol: tokenPair.toSymbol,
      decimals: tokenPair.toDecimals,
      chainType: bridge.tokenPairService.getChainType(tokenPair.toChainName),
      chainName: tokenPair.toChainName
    };
    if (this._direction == 'MINT') {
      this._fromChainInfo = fromChainInfo;
      this._toChainInfo = toChainInfo;
    } else {
      this._fromChainInfo = toChainInfo;
      this._toChainInfo = fromChainInfo;
    }
    // smg info
    this._smg = null;
    this._gpkInfo = null;
    // server side para
    this._quota = null;
    this._fee = null;
    // storage
    this._task = new CrossChainTask(this.id);
    // runtime context
    this._ota = '';
  }

  async init(options) {
    console.debug("bridgeTask init at %s ms", tool.getCurTimestamp());
    // check
    let validWallet = await this._bridge.checkWallet(this._fromChainInfo.chainName, this._wallet);
    if (!validWallet) {
      throw new Error("Invalid wallet");
    }
    let err = await this._checkFee(options.isSubsidy);
    if (err) {
      throw new Error(err);
    }
    err = await this._checkSmg(); // depends on fee
    if (err) {
      throw new Error(err);
    }
    let [fromAccountErr, toAccountErr] = await Promise.all([
      this._checkFromAccount(),
      this._checkToAccount(options)
    ]);
    err = fromAccountErr || toAccountErr;
    if (err) {
      throw new Error(err);
    }
    // set task data
    let taskData = {
      assetPairId: this._tokenPair.id,
      assetType: this._tokenPair.readableSymbol,
      assetAlias: this._tokenPair.assetAlias,
      protocol: this._tokenPair.protocol,
      direction: this._direction,
      amount: this._amount,
      bridge: this._tokenPair.bridge,
      fromAccount: this._fromAccount,
      fromAccountId: options.fromAccountId || '',
      toAccount: this._toAccount,
      toAccountId: options.toAccountId || '',
      fromChainName: this._fromChainInfo.chainName,
      toChainName: this._toChainInfo.chainName,
      fromSymbol: this._fromChainInfo.symbol,
      toSymbol: this._toChainInfo.symbol,
      fromDecimals: this._fromChainInfo.decimals,
      toDecimals: this._toChainInfo.decimals,
      fromChainType: this._fromChainInfo.chainType,
      toChainType: this._toChainInfo.chainType,
      fee: this._fee,
      smg: { name: this._smg ? this._smg.name : "", gpk: this._gpkInfo ? this._gpkInfo.gpk : "" }
    };
    // console.debug({taskData});
    this._task.setTaskData(taskData);
  }

  async start() {
    console.debug("bridgeTask tokenpair %s start at %s ms", this._tokenPair.id, tool.getCurTimestamp());
    // build
    let steps = await this._buildTaskSteps();
    this._task.initSteps(steps);
    this._task.setTaskData({ status: "Performing" });
    // save context
    let bridge = this._bridge;
    let ccTaskData = this._task.ccTaskData;
    bridge.stores.crossChainTaskRecords.addNewTradeTask(ccTaskData);
    await bridge.storageService.save("crossChainTaskRecords", ccTaskData.ccTaskId, ccTaskData);
    // process
    this._procTaskSteps();
  }

  async _checkFee(isSubsidy) {
    let options = { protocol: this._tokenPair.protocol, address: [this._fromAccount || "", this._toAccount] };
    let isErc20 = (this._tokenPair.protocol === "Erc20");
    if (!isErc20) {
      options.batchSize = this._amount.length;
    }
    // should use assetAlias as assetType to call bridge external api
    this._fee = await this._bridge.estimateFee((this._tokenPair.assetAlias || this._tokenPair.readableSymbol), this._fromChainInfo.chainName, this._toChainInfo.chainName, options);
    if (this._fee.networkFee.isSubsidy) {
      // check subsidyCrossSc coin balance and clear subsidyFee
      let subsidyFee = tool.parseFee(this._fee, this._amount, this._fee.networkFee.unit, { feeType: "networkFee", includeSubsidy: true });
      let subsidyBalance = this._fee.networkFee.subsidyBalance;
      console.debug("balance for fee subsidy: %s/%s %s", subsidyBalance, subsidyFee, this._fee.networkFee.unit);
      if (new BigNumber(subsidyBalance).lt(subsidyFee)) {
        if (isSubsidy === false) { // default is true
          this._fee.networkFee.isSubsidy = false;
        } else {
          console.error("Not enough balance for fee subsidy: %s/%s %s", subsidyBalance, subsidyFee, this._fee.networkFee.unit);
          return "Not enough balance for fee subsidy";
        }
      }
    }
    if (isErc20) {
      let assetFee = tool.parseFee(this._fee, this._amount, this._tokenPair.readableSymbol);
      if (new BigNumber(assetFee).gte(this._amount)) { // input amount includes fee
        console.error("Amount is too small to pay the bridge fee: %s %s", assetFee, this._tokenPair.readableSymbol);
        return "Amount is too small to pay the bridge fee";
      }
    }
    return "";
  }

  async _checkSmg() { // depends on fee
    // get active smg
    let smg = await this._bridge.getSmgInfo();
    this._smg = smg;
    if (this._tokenPair.bridge) { // only for unifying process flow, other bridge do not care smg
      return "";
    }
    let gpk = "", curve = gpkCurves.secp256, algo = gpkAlgs.ecdsa;
    if ((this._fromChainInfo.chainType === 'BTC') && smg.gpk3) {
      algo = gpkAlgs.schnorr340;
    }
    for (let i = 1; smg["gpk" + i]; i++) {
      if (curve == smg["curve" + i] && algo == smg["algo" + i]) {
        gpk = smg["gpk" + i];
        break;
      }
    }
    if (!gpk) {
      return "Invalid protocol parameter";
    }
    this._gpkInfo = { gpk, curve, algo };
    if (this._tokenPair.protocol !== "Erc20") { // only Erc20 need to check token smg balance
      return "";
    }
    // check quota
    let fromChainType = this._fromChainInfo.chainType;
    if (smg.changed) { // optimize for mainnet getQuota performance issue
      this._quota = await this._bridge.storemanService.getStroremanGroupQuotaInfo(fromChainType, this._tokenPair.id, smg.id);
      console.debug("%s %s %s quota: %O", this._direction, this._amount, this._tokenPair.readableSymbol, this._quota);
      let networkFee = tool.parseFee(this._fee, this._amount, this._tokenPair.readableSymbol, { feeType: "networkFee" });
      let agentAmount = new BigNumber(this._amount).minus(networkFee); // use agent amount to check maxQuota and minValue, which include agentFee, exclude networkFee
      if (agentAmount.gt(this._quota.maxQuota)) {
        return "Exceed maxQuota";
      } else if (agentAmount.lt(this._quota.minQuota)) {
        return "Amount is too small";
      }
    }
    // check activating balance
    let tokenAccount = (this._direction === "MINT") ? this._tokenPair.fromAccount : this._tokenPair.toAccount;
    let isLockCoin = (tokenAccount == 0);
    let chainInfo = this._bridge.chainInfoService.getChainInfoByType(fromChainType);
    let crossScAddr = chainInfo.crossScAddr || (chainInfo.CircleBridge && (chainInfo.CircleBridge.crossScAddr || chainInfo.CircleBridge.crossScAddrV2));
    if ((!crossScAddr) && chainInfo.minReserved) { // do not check contract as it only set once
      let smgAddr = this._getSmgAddress(fromChainType);
      let smgBalance = await this._bridge.storemanService.getAccountBalance(this._tokenPair.id, fromChainType, smgAddr, { wallet: this._wallet, isCoin: true });
      console.debug("%s smgAddr %s balance: %s", fromChainType, smgAddr, smgBalance.toFixed());
      let estimateBalance = smgBalance;
      if (isLockCoin) { // only lock coin would change balance, ignore lock token networkFee
        estimateBalance = estimateBalance.plus(this._amount);
      }
      if (estimateBalance.lt(chainInfo.minReserved)) {
        if (isLockCoin) {
          let diff = new BigNumber(chainInfo.minReserved).minus(smgBalance);
          console.error("Amount is too small to activate storeman account, at least %s %s", diff.toFixed(), this._tokenPair.readableSymbol);
          return "Amount is too small to activate storeman account";
        } else {
          return "Storeman account is inactive";
        }
      }
    }
    // check xrp token trust line
    if ((fromChainType === "XRP") && !isLockCoin) { // XRP token need to check smg trust line
      if (!this._bridge.validateXrpTokenAmount(this._amount)) {
        return "Amount out of range";
      }
      let smgAddr = this._getSmgAddress(fromChainType);
      let line = await this._bridge.storemanService.getXrpTokenTrustLine(tokenAccount, smgAddr);
      if ((!line) || line.limit.minus(line.balance).lt(this._amount)) {
        let token = tool.parseXrpTokenPairAccount(tokenAccount, true).join(".");
        console.debug("Storeman has no trust line for %s: smg=%s, liquidity=%s", token, smgAddr, line ? line.limit.minus(line.balance).toFixed() : "0");
        return "The XRPL token crosschain is being activated. Please try again later";
      }
    }
    return "";
  }

  async _checkFromAccount() {
    let chainType = this._fromChainInfo.chainType;
    if (!this._fromAccount) { // third party wallet
      return "";
    }

    let chainInfo = this._bridge.chainInfoService.getChainInfoByType(chainType);
    let coinBalance = await this._bridge.storemanService.getAccountBalance(this._tokenPair.id, chainType, this._fromAccount, { wallet: this._wallet, isCoin: true });
    let assetBalance;
    let coinSymbol = this._bridge.chainInfoService.getCoinSymbol(chainType);
    let requiredCoin = new BigNumber(0);
    let requiredAsset = 0;
    if (this._tokenPair.readableSymbol === coinSymbol) { // asset is coin
      assetBalance = coinBalance;
      requiredCoin = requiredCoin.plus(this._amount); // includes fee
      requiredAsset = 0;
    } else {
      assetBalance = await this._bridge.storemanService.getAccountBalance(this._tokenPair.id, chainType, this._fromAccount, { wallet: this._wallet });
      requiredCoin = requiredCoin.plus(tool.parseFee(this._fee, this._amount, coinSymbol));
      requiredAsset = this._amount;
    }
    if (chainType === "ALGO") { // ALGO min-balance includes minReserved
      let aInfo = await this._bridge.iwan.getAccountInfo("ALGO", this._fromAccount);
      if (aInfo) {
        if (aInfo.deleted) {
          return "Wallet account is inactive";
        }
        let minBalance = new BigNumber(aInfo['min-balance'] || 0).div(Math.pow(10, chainInfo.chainDecimals));
        console.debug("min balance: %s", minBalance.toFixed());
        requiredCoin = requiredCoin.plus(minBalance);
      } else {
        return "Wallet account is not found";
      }
    } else if (chainInfo.minReserved) {
      requiredCoin = requiredCoin.plus(chainInfo.minReserved);
    }
    if (chainType === "SUI") { // SUI wallet does not check if there is enough gas fee
      requiredCoin = requiredCoin.plus("0.01");
    } else if ((chainType === "SOL") && (this._tokenPair.bridge === "Circle")) { // SOL require minReserved, and need extra depositForBurn messageSentEventData rent
      requiredCoin = requiredCoin.plus("0.00295104");
    }
    console.debug("required coin balance: %s/%s", requiredCoin.toFixed(), coinBalance.toFixed());
    if (coinBalance.lt(requiredCoin)) {
      return "Insufficient balance";
    }
    if (this._tokenPair.protocol === "Erc20") {
      console.debug("required asset balance: %s/%s", requiredAsset, assetBalance.toFixed());
      if (assetBalance.lt(requiredAsset)) {
        return "Insufficient asset";
      }
    }
    return "";
  }

  async _checkToAccount(options) {
    let chainType = this._toChainInfo.chainType;
    let tokenAccount = (this._direction === "MINT") ? this._tokenPair.toAccount : this._tokenPair.fromAccount;
    let isRedeemCoin = (tokenAccount == 0);
    // check address id
    if (options.toAccountId) {
      let addresses = await this._bridge.accountId2Address(options.toAccountId, this._toChainInfo.chainName);
      if (!addresses.find(v => v.address === this._toAccount)) {
        return "Recipient address and id do not match";
      }
    }
    // check activating balance
    let chainInfo = this._bridge.chainInfoService.getChainInfoByType(chainType);
    if (chainInfo.minReserved && ((chainType !== "SOL") || isRedeemCoin)) { // solana contract will pay on releasing token, but user should pay on releasing SOL
      let balance = await this._bridge.storemanService.getAccountBalance(this._tokenPair.id, chainType, this._toAccount, { isCoin: true });
      console.debug("toAccount %s balance: %s", this._toAccount, balance.toFixed());
      let estimateBalance = balance;
      if (isRedeemCoin) { // only redeem coin would change balance
        let fee = tool.parseFee(this._fee, this._amount, this._tokenPair.readableSymbol);
        estimateBalance = estimateBalance.plus(this._amount).minus(fee);
      }
      if (estimateBalance.lt(chainInfo.minReserved)) {
        if (isRedeemCoin) {
          let diff = new BigNumber(chainInfo.minReserved).minus(balance);
          console.error("Amount is too small to activate recipient account, at least %s %s", diff.toFixed(), this._fromChainInfo.symbol);
        }
        return util.format("%s enforces an existential deposit requirement. Make sure that the balance of destination address remains above %s %s.",
          chainInfo.chainName,
          chainInfo.minReserved,
          chainInfo.symbol || chainType);
      }
    }
    // check xrp token trust line
    if (chainType === "XRP") {
      try {
        let aInfo = await this._bridge.iwan.getAccountInfo("XRP", this._toAccount, { version: "v2" });
        if (aInfo && aInfo.account_data.FlagsParsed && aInfo.account_data.FlagsParsed.lsfRequireDestTag) { // FlagsParsed is appeded by iwan
          console.error("XRP account %s requires destination tag", this._toAccount);
          return "The destination address requiring the user to input a tag is not supported. Please switch to another suitable XRPL address, such as a standard wallet address.";
        }
      } catch (err) { // nonexistent account is acceptable
        let errString = err.toString();
        if (errString !== "Account not found.") {
          return errString;
        }
      }
      if (!isRedeemCoin) { // XRP token need to check recipient trust line
        if (!this._bridge.validateXrpTokenAmount(this._amount)) {
          return "Amount out of range";
        }
        try {
          let line = await this._bridge.storemanService.getXrpTokenTrustLine(tokenAccount, this._toAccount);
          if ((!line) || line.limit.minus(line.balance).lt(this._amount)) {
            let token = tool.parseXrpTokenPairAccount(tokenAccount, true).join(".");
            let reason = line ? "Liquidity is not enough" : "No trust line";
            let msg = util.format("%s for %s", reason, token);
            console.debug("Recipient %s %s: liquidity=%s", this._toAccount, msg, line ? line.limit.minus(line.balance).toFixed() : "0");
            return msg;
          }
        } catch (err) { // "Account not found." or other exceptions
          return err.toString();
        }
      }
    }
    // check algo status and opt in
    if ((chainType === "ALGO") && !isRedeemCoin) { // algorand token need to check recipient opt in
      let aInfo = await this._bridge.iwan.getAccountInfo("ALGO", this._toAccount);
      if (aInfo) {
        if (aInfo.deleted) {
          return "Recipient account is inactive";
        }
        let assetId = Number(tokenAccount), optIn = null;
        if ((aInfo['total-assets-opted-in'] > 0) && aInfo.assets) {
          optIn = aInfo.assets.find(v => ((v['asset-id'] === assetId) && (v['opted-in-at-round'] > 0)));
        }
        if (!optIn) {
          let msg = "No opt-in for token " + assetId;
          return msg;
        }
      } else {
        return "Recipient account is not found";
      }
    }
    return "";
  }

  async _buildTaskSteps() {
    let ccTaskData = this._task.ccTaskData;
    // to get the stepsFunc from server api
    let convert = {
      ccTaskId: ccTaskData.ccTaskId,
      tokenPairId: ccTaskData.assetPairId,
      convertType: ccTaskData.convertType,
      fromSymbol: ccTaskData.fromSymbol,
      fromAddr: ccTaskData.fromAccount,
      toSymbol: ccTaskData.toSymbol,
      toAddr: ccTaskData.toAccount,
      storemanGroupId: this._smg.id,
      gpkInfo: this._gpkInfo,
      value: ccTaskData.amount,
      fee: this._fee,
      route: (this._tokenPair.routes && this._tokenPair.routes[0]) || "",
      wallet: this._wallet
    };
    // console.debug("checkTaskSteps: %O", convert);
    let steps = await this._bridge.cctHandleService.getConvertInfo(convert);
    // console.debug("getConvertInfo: %O", steps);
    return steps;
  }

  async _procTaskSteps() {
    let steps = this._task.ccTaskData.stepData;
    console.debug("bridgeTask %s proc %d steps start at %d ms", this.id, steps.length, tool.getCurTimestamp());
    let curStep = 0, executedStep = -1, stepTxHash = "";
    for (; curStep < steps.length;) {
      let taskStep = steps[curStep];
      if (executedStep != curStep) {
        console.debug("bridgeTask %s proc step %d at %d ms", this.id, curStep, tool.getCurTimestamp());
        await this._bridge.txTaskHandleService.processTxTask(taskStep, this._wallet);
        executedStep = curStep;
      }
      /* now sync abnormal stepResult and txHash are returned via finishTaskStep, it should emit TaskStepResult to save task info and trigger lock event, it will trigger finishTaskStep again, but it is harmless,
         it would be more elegant if they emit TaskStepResult event instead of calling finishTaskStep to reuse the unified process
      */
      let stepResult = taskStep.stepResult;
      if (stepResult) { // sync result
        if (["Failed", "Rejected"].includes(stepResult)) { // abnormal, result is error info
          await this._bridge.eventService.emitEvent("TaskStepResult", { ccTaskId: this.id, stepIndex: taskStep.stepIndex, txHash: "", result: stepResult, errInfo: taskStep.errInfo });
          break;
        } else if (!this._wallet) { // normal ota, result is ota address, XRP tagId or BTC randomId
          this._procOtaAddr(stepResult); // ota save step and task info by itself
        } else if ((taskStep.name === "erc20Approve") && (this._fromChainInfo.chainType === "MOVR")) { // normal tx receipt, has already emitted TaskStepResult event, here is only for some special processes
          await tool.sleep(30000); // Moonbeam need to wait for approve tx to take effect
        }
        console.debug("bridgeTask %s proc step %d: %O", this.id, curStep, taskStep);
        curStep++;
        stepTxHash = "";
      } else { // normal, tx always sync return hash, and async return status by emit TaskStepResult event
        if (taskStep.txHash && !stepTxHash) { // sync txHash
          await this._bridge.eventService.emitEvent("TaskStepResult", { ccTaskId: this.id, stepIndex: taskStep.stepIndex, txHash: taskStep.txHash, result: "" });
          stepTxHash = taskStep.txHash;
        }
        if ((curStep + 1) >= steps.length) { // immediatly finish loop after last step tx
          break;
        } else { // otherwise wait step result
          await tool.sleep(3000);
        }
      }
    }
    console.debug("bridgeTask %s proc %d steps finish at %d ms", this.id, steps.length, tool.getCurTimestamp());
  }

  _procOtaAddr(stepResult) {
    if (this._ota) {
      return;
    }
    let records = this._bridge.stores.crossChainTaskRecords;
    let chainType = this._fromChainInfo.chainType;
    let ota = { taskId: this.id };
    if (["BTC", "LTC", "DOGE"].includes(chainType)) {
      records.setTaskOtaInfo(this.id, { address: stepResult.address, randomId: stepResult.randomId });
      this._ota = stepResult.address;
      ota.address = this._ota;
    } else if (chainType === "XRP") {
      let xrpAddr = this._getXAddressByTagId(stepResult);
      records.setTaskOtaInfo(this.id, { address: xrpAddr.xAddr, tagId: xrpAddr.tagId, rAddress: xrpAddr.rAddr });
      this._ota = xrpAddr.xAddr;
      ota.address = this._ota;
      ota.rAddress = xrpAddr.rAddr;
      ota.tagId = xrpAddr.tagId;
    } else {
      throw new Error("Invalid ota chain type " + chainType);
    }
    let ccTask = records.ccTaskRecords.get(this.id);
    this._bridge.storageService.save("crossChainTaskRecords", this.id, ccTask);
    this._bridge._distributeEvent("ota", ota);
    console.debug("%s OTA: %O", chainType, ota);
  }

  _getSmgXrpClassicAddress() {
    let pubKey = Secp256k1.keyFromPublic("04" + this._gpkInfo.gpk.slice(2), 'hex');
    let compressed = pubKey.getPublic(true, 'hex');
    let deriveAddress = keypairs.deriveAddress(compressed.toUpperCase());
    return deriveAddress;
  }

  _getXAddressByTagId(tagId) {
    let deriveAddress = this._getSmgXrpClassicAddress();
    let xrpXAddr = xrpAddrCodec.classicAddressToXAddress(deriveAddress, tagId);
    let xrpAddr = {
      xAddr: xrpXAddr,
      rAddr: deriveAddress,
      tagId
    }
    return xrpAddr;
  }

  _getSmgAddress(chainType) {
    let extension = this._bridge.configService.getExtension(chainType);
    if (extension && extension.tool && extension.tool.gpk2Address) {
      return extension.tool.gpk2Address(this._gpkInfo.gpk, chainType, this._bridge.network);
    } else if ("XRP" === chainType) {
      return this._getSmgXrpClassicAddress();
    } else { // only for not-sc-chain to check smg account, other chains should not call this function
      throw new Error("Unknown " + chainType + " smg address");
    }
  }
}

export default BridgeTask;
