import BigNumber from "bignumber.js";
import tool from "../../utils/tool.js";
import axios from "axios";
import util from "util";

const API_SERVER_SCAN_CHAINS = ["XRP", "DOT", "ADA", "PHA", "ATOM", "NOBLE", "KAVA", "SOL"];

// DepositForBurn
const CctpEvmDepositEventHash = "0x2fa9ca894982930190727e75500a97d8dc500233a5065e0f3126c48fbe0343c0"; // v1

class StoremanService {
  constructor() {
  }

  async init(frameworkService, options) {
    this.isTestMode = options.isTestMode || false;
    this.frameworkService = frameworkService;
    this.iwan = frameworkService.getService("iWanConnectorService");
    this.chainInfoService = frameworkService.getService("ChainInfoService");
    this.configService = frameworkService.getService("ConfigService");
    this.crossTaskCfg = this.configService.getGlobalConfig("crossTask");
  }

  async getStroremanGroupQuotaInfo(fromChainType, tokenPairId, storemanGroupId) {
    try {
      let tokenPairService = this.frameworkService.getService("TokenPairService");
      let tokenPair = tokenPairService.getTokenPair(tokenPairId);
      if (tokenPair) {
        let toChainType = (fromChainType === tokenPair.fromChainType) ? tokenPair.toChainType : tokenPair.fromChainType;
        let decimals = (fromChainType === tokenPair.fromChainType) ? tokenPair.fromDecimals : tokenPair.toDecimals;
        let network = this.configService.getNetwork();
        if ((tokenPair.ancestorName === "NIGHT") && (network === "mainnet") && !this.isTestMode) {
          let minQuota = (toChainType === "ADA")? "10000" : "0";
          return {maxQuota: Infinity, minQuota};
        }
        let ignoreReservation = (this.isTestMode && (network === "mainnet"));
        let quota = await this.iwan.getStoremanGroupQuota(fromChainType, storemanGroupId, [tokenPair.ancestorSymbol], toChainType, ignoreReservation);
        // console.debug("getStroremanGroupQuotaInfo: %s, %s, %s, %s, %O", fromChainType, storemanGroupId, tokenPair.ancestorSymbol, toChainType, quota);
        let maxQuota = new BigNumber(quota[0].maxQuota).div(Math.pow(10, parseInt(decimals)));
        let minQuota = new BigNumber(quota[0].minQuota).div(Math.pow(10, parseInt(decimals)));
        return { maxQuota: maxQuota.toFixed(), minQuota: minQuota.toFixed() };
      }
    } catch (err) {
      console.error("getStroremanGroupQuotaInfo error: %O", err);
    }
    return { maxQuota: "0", minQuota: "0" };
  }

  validateAddress(chainType, address) { // validate address format and basic static rule
    let result = false;
    let network = this.configService.getNetwork();
    let extension = this.configService.getExtension(chainType);
    if (extension && extension.tool && extension.tool.validateAddress) {
      result = extension.tool.validateAddress(address, { network, chain: chainType });
    } else if ("WAN" === chainType) {
      result = tool.isValidWanAddress(address);
    } else if ("BTC" === chainType) {
      result = tool.isValidBtcAddress(address, network);
    } else if ("LTC" === chainType) {
      result = tool.isValidLtcAddress(address, network);
    } else if ("DOGE" === chainType) {
      result = tool.isValidDogeAddress(address, network);
    } else if ("XRP" === chainType) {
      result = tool.isValidXrpAddress(address);
    } else if ("XDC" === chainType) {
      result = tool.isValidXdcAddress(address);
    } else { // default check EVM
      let chainInfo = this.chainInfoService.getChainInfoByType(chainType);
      if (chainInfo._isEVM) {
        result = tool.isValidEthAddress(address);
      }
    }
    return result;
  }

  async checkAdaRecipient(address) { // address format should have been validated by validateAddress
    try {
      let network = this.configService.getNetwork();
      let tool = this.configService.getExtension("ADA").tool;
      let sriptHash = tool.validateAddress(address, { network, retScriptHash: true });
      if (typeof (sriptHash) === "boolean") {
        return sriptHash;
      }
      let configScAddr = this.configService.getGlobalConfig("crossConfigSc");
      let crossConfigAbi = this.configService.getAbi("crossConfig");
      let key = "2147485463:ScriptReceiver:" + sriptHash;
      let result = await this.iwan.callScFunc("WAN", configScAddr, "getValue", [key], crossConfigAbi);
      return (result == 1); // bytes
    } catch (err) {
      console.error("checkSolRecipient %s error: %O", err);
      return false;
    }
  }

  async checkSolRecipient(address) { // address format should have been validated by validateAddress
    try {
      let accountInfo = await this.iwan.getAccountInfo("SOL", address);
      if (!accountInfo) { // account not exist is valid for SystemAccount, uninitialized accounts are owned by System Program
        return true;
      }
      let tool = this.configService.getExtension("SOL").tool;
      let sysProgId = tool.getSystemProgramId();
      return (sysProgId.equals(tool.getPublicKey(accountInfo.owner)) && (!accountInfo.executable));
    } catch (err) {
      console.error("checkSolRecipient %s error: %O", err);
      return false;
    }
  }

  async checkWalletId(chainType, wallet, options = {}) {
    let chainInfo = this.chainInfoService.getChainInfoByType(chainType);
    if (chainInfo.walletChainId !== undefined) {
      if (wallet && wallet.getChainId) {
        let walletChainId = await wallet.getChainId();
        if (chainInfo.walletChainId == walletChainId) {
          return true;
        } else {
          if (options.debug) {
            console.debug("checkWalletId %s != %s", walletChainId, chainInfo.walletChainId);
          }
          return false;
        }
      } else {
        return false;
      }
    } else {
      return true;
    }
  }

  async getAccountBalance(assetPairId, chainType, addr, options = {}) {
    try {
      let tokenPairService = this.frameworkService.getService("TokenPairService");
      let tokenPair = tokenPairService.getTokenPair(assetPairId);
      if (!tokenPair) {
        return new BigNumber(0);
      }
      let balance = 0, decimals;
      let direction = (chainType === tokenPair.fromChainType);
      let tokenAccount = direction ? tokenPair.fromAccount : tokenPair.toAccount;
      let chainInfo = this.chainInfoService.getChainInfoByType(chainType);
      let isCoin = options.isCoin || (tokenAccount === "0x0000000000000000000000000000000000000000");
      if (isCoin) {
        decimals = direction ? tokenPair.fromScInfo.chainDecimals : tokenPair.toScInfo.chainDecimals;
        if (options.wallet && options.wallet.getBalance) { // prefer to get balance from wallet
          balance = await options.wallet.getBalance(addr);
        } else {
          balance = await this.iwan.getBalance(chainType, addr);
        }
      } else {
        decimals = direction ? tokenPair.fromDecimals : tokenPair.toDecimals;
        if (tokenPair.protocol === "Erc1155") {
          if (chainInfo._isEVM) {
            balance = await this.getErc1155Balance(chainType, addr, tokenAccount);
          } else if (options.wallet) {
            balance = await options.wallet.getBalance(addr, tool.ascii2letter(tool.hexStrip0x(tokenAccount)));
          }
        } else { // Erc20, Erc721
          if (chainInfo._isEVM) {
            balance = await this.iwan.getTokenBalance(chainType, addr, tokenAccount);
          } else { // non EVM, tokenAccount is encoded as ascii by default except some chains
            if (!["ALGO"].includes(chainType)) {
              tokenAccount = tool.hexStrip0x(tokenAccount);
              if (!["DUST"].includes(chainType)) {
                tokenAccount = tool.ascii2letter(tokenAccount);
              }
            }
            if (options.wallet && options.wallet.getBalance) {
              balance = await options.wallet.getBalance(addr, tokenAccount);
            } else { // default iwan, if iwan do not support, throw exception and return 0
              balance = await this.iwan.getTokenBalance(chainType, addr, tokenAccount);
            }
          }
        }
      }
      balance = new BigNumber(balance).div(Math.pow(10, decimals));
      console.debug("get %s %s address %s balance: %s", chainType, isCoin ? "coin" : ("token " + tokenAccount), addr, balance.toFixed());
      return balance;
    } catch (err) {
      console.error("get %s address %s balance error: %O", chainType, addr, err);
      return new BigNumber(0);
    }
  }

  async getAccountBalances(chainType, addr, assets, options) {
    let chainInfo = this.chainInfoService.getChainInfoByType(chainType);
    let result = {};
    if (chainInfo._isEVM) { // support multicall
      let evmAddress = "";
      try { // convert xdc and tron variant address to standard evm address silently
        evmAddress = tool.getStandardAddressInfo(chainType, addr, this.configService.getExtension(chainType)).evm;
      } catch (err) {
        return result;
      }
      if (tool.isValidEthAddress(evmAddress)) {
        let mcs = [], subgraphs = [];
        for (let asset in assets) {
          let tokenInfo = assets[asset];
          if (tokenInfo.protocol === "Erc1155") {
            subgraphs.push({ asset, call: this.getErc1155Balance(chainType, addr, tokenInfo.address) });
          } else { // Erc20 and Erc721
            if (tokenInfo.address == 0) { // coin
              mcs.push({
                call: ['getEthBalance(address)(uint256)', evmAddress],
                returns: [[asset]]
              });
            } else { // token
              mcs.push({
                target: tokenInfo.address,
                call: ['balanceOf(address)(uint256)', evmAddress],
                returns: [[asset]]
              });
            }
          }
        }
        // multicall
        let res;
        if (mcs.length) {
          res = await this.iwan.multiCall(chainType, mcs);
          let balances = res.results.transformed;
          mcs.forEach(mc => {
            let asset = mc.returns[0][0];
            let tokenInfo = assets[asset];
            let balance = balances[asset];
            if (typeof (balance) === "string") { // Tron
              // do nothing
            } else if (typeof (balance._hex) === "string") { // other EVMs
              balance = balance._hex;
            } else {
              console.error("unrecognized %s %s balance: %O", chainType, asset, balance);
              balance = "";
              return;
            }
            result[asset] = new BigNumber(balance).div(Math.pow(10, tokenInfo.decimals)).toFixed();
          });
        }
        // subgraph
        if (subgraphs.length) {
          res = await Promise.all(subgraphs.map(v => v.call));
          res.forEach((v, i) => result[subgraphs[i].asset] = v);
        }
      }
    } else if (options.wallet && options.wallet.getBalance) {
      let checkWalletId = await this.checkWalletId(chainType, options.wallet);
      if (checkWalletId && this.validateAddress(chainType, addr)) {
        let assetArray = [], balances;
        try { // input addr format maybe not match wallet
          if (options.wallet.getBalances) { // fix cardano Eternl too many requests error
            let tokens = []; // includes coin: 0x0000000000000000000000000000000000000000 => ""
            for (let asset in assets) {
              assetArray.push(asset);
              tokens.push(tool.ascii2letter(tool.hexStrip0x(assets[asset].address)));
            }
            balances = await options.wallet.getBalances(addr, tokens);
          } else {
            let ps = [];
            for (let asset in assets) {
              assetArray.push(asset);
              ps.push(options.wallet.getBalance(addr, tool.ascii2letter(tool.hexStrip0x(assets[asset].address))));
            }
            balances = await Promise.all(ps);
          }
          for (let i = 0; i < assetArray.length; i++) {
            let asset = assetArray[i];
            result[asset] = new BigNumber(balances[i]).div(Math.pow(10, assets[asset].decimals)).toFixed();
          }
        } catch (err) {
          console.error("get %s %s balances error: %O", chainType, addr, err);
        }
      }
    } else { // default iwan, data formats are different and needs to parse separately
      if (this.validateAddress(chainType, addr)) {
        let balances = await this.iwan.getAllBalances(chainType, addr);
        let bMap = new Map();
        if (chainType === "ALGO") {
          balances.forEach(v => bMap.set(v.assetId, v.amount));
          for (let asset in assets) {
            let tokenInfo = assets[asset]; // include coin: 0
            result[asset] = new BigNumber(bMap.get(Number(tokenInfo.address)) || 0).div(Math.pow(10, tokenInfo.decimals)).toFixed();
          }
        } else if (chainType === "SUI") {
          balances.forEach(v => bMap.set(v.coinType, v.totalBalance));
          for (let asset in assets) {
            let tokenInfo = assets[asset]; // include coin: 0x2::sui::SUI
            result[asset] = new BigNumber(bMap.get(tool.ascii2letter(tokenInfo.address)) || 0).div(Math.pow(10, tokenInfo.decimals)).toFixed();
          }
        } else if (chainType === "TON") {
          balances.forEach(v => bMap.set(v.jetton, v.balance));
          for (let asset in assets) {
            let tokenInfo = assets[asset]; // include coin: 0x0000000000000000000000000000000000000000
            let addr = tokenInfo.address;
            if (addr !== "0x0000000000000000000000000000000000000000") {
              addr = tool.ascii2letter(tokenInfo.address);
            }
            result[asset] = new BigNumber(bMap.get(addr) || 0).div(Math.pow(10, tokenInfo.decimals)).toFixed();
          }
        }
      }
    }
    return result;
  }

  async getXrpTokenTrustLine(tokenAccount, userAccount) {
    let [currency, issuer] = tool.parseXrpTokenPairAccount(tokenAccount, false);
    let lines = await this.iwan.getTrustLines(userAccount);
    let line = lines.find(v => (v.account === issuer) && (v.currency === currency));
    if (line) {
      return {
        limit: new BigNumber(line.limit),
        balance: new BigNumber(line.balance)
      };
    }
    return null;
  }

  async getNftInfo(type, chain, tokenAddr, owner, options) {
    tokenAddr = tokenAddr.toLowerCase();
    owner = owner.toLowerCase();
    let result = [], chainInfo = this.chainInfoService.getChainInfoByType(chain);
    if (chainInfo._isEVM) {
      if (options.tokenIds) {
        result = await this._getNftInfoFromEvmChain(type, chain, tokenAddr, owner, options.tokenIds);
      } else {
        result = await this._getNftInfoFromSubgraph(type, chain, tokenAddr, owner, options.limit, options.skip, options.includeUri);
      }
    } else if (options.wallet && options.wallet.getNftInfo) { // now only ADA
      if (chain === "ADA") {
        result = await this._getNftInfoFromCardano(type, chain, tokenAddr, owner, options);
      }
    }
    return result;
  }

  async _getNftInfoFromCardano(type, chain, tokenAddr, owner, options) {
    let extension = this.configService.getExtension(chain);
    let policy = tool.ascii2letter(tool.hexStrip0x(tokenAddr));
    let nfts = await options.wallet.getNftInfo(owner, policy); // id is hex without 0x prefix, not normal number
    if (options.tokenIds) { // should be dicimal number
      let tokenIds = options.tokenIds;
      if (!options.isNative) {
        let mappingIds = await this.getNftMappingId(options.ancestorChainType, options.ancestorAccount, tokenIds);
        tokenIds = mappingIds.map(v => new BigNumber('0x' + extension.tool.encodeNftAssetName(v)).toFixed());
      }
      // tokenIds is decimal number corresponding to assetName
      nfts = nfts.filter(asset => {
        let assetId = new BigNumber('0x' + asset.id);
        return tokenIds.find(id => assetId.eq(id));
      });
    }
    if (nfts.length) {
      if (options.isNative) {
        let infos = await this.getCardanoNftInfo(options.toChainID, policy, nfts.map(v => v.id));
        nfts.forEach(v => {
          v.uri = infos[v.id];
          v.id = new BigNumber('0x' + v.id).toFixed();
        });
      } else {
        let mappingIds = nfts.map(v => tool.decodeCardanoNftAssetName(v.id).id).filter(v => (v != 0)); // ignore invalid crossId
        let ancestorIds = await this.getNftAncestorId(options.ancestorChainType, options.ancestorAccount, mappingIds);
        let ancestorChainInfo = this.chainInfoService.getChainInfoByType(options.ancestorChainType);
        let ancestors = await this._getNftInfoFromEvmChain(type, options.ancestorChainType, options.ancestorAccount, ancestorChainInfo.crossScAddr, ancestorIds, false);
        ancestors.forEach((v, i) => {
          nfts[i].id = v.id; // ancestor nft id
          nfts[i].uri = v.uri;
        });
      }
    }
    return nfts;
  }

  async _getNftInfoFromEvmChain(type, chain, tokenAddr, owner, tokenIds, checkAvailable = true) {
    let result = [], mcs = [];
    tokenIds.forEach(v => {
      let id = "0x" + new BigNumber(v).toString(16);
      if (type === "Erc721") { // get erc721 owner
        mcs.push({
          target: tokenAddr,
          call: ["ownerOf(uint256)(address)", id],
          returns: [[id + "-owner"]]
        });
      } else { // get erc1155 balance
        mcs.push({
          target: tokenAddr,
          call: ["balanceOf(address,uint256)(uint256)", owner, id],
          returns: [[id + "-balance"]]
        });
      }
      // uri
      let uriIf = (type === "Erc721") ? "tokenURI(uint256)(string)" : "uri(uint256)(string)";
      mcs.push({
        target: tokenAddr,
        call: [uriIf, id],
        returns: [[id + "-uri"]]
      });
    });
    try {
      let res = await this.iwan.multiCall(chain, mcs);
      let data = res.results.transformed;
      tokenIds.forEach(v => {
        let id = "0x" + new BigNumber(v).toString(16);
        let balance = 0;
        if (type === "Erc721") {
          let getOwner = data[id + "-owner"];
          if (tool.cmpAddress(getOwner, owner)) {
            balance = 1;
          }
        } else {
          balance = data[id + "-balance"]._hex;
        }
        balance = new BigNumber(balance);
        if (balance.gt(0) || !checkAvailable) {
          let fullId = (Array(63).fill('0').join("") + tool.hexStrip0x(id)).slice(-64);
          result.push({
            id: new BigNumber(id).toFixed(),
            balance: balance.toFixed(),
            uri: data[id + "-uri"].replace(/\{id\}/g, fullId)
          });
        } else {
          console.debug("%s does not own %s %s token %s id %s", owner, chain, type, tokenAddr, v);
        }
      });
    } catch (err) { // erc721 would throw error if query nonexistent token
      console.error("getNftInfoFromChain error: %O", err);
    }
    return result;
  }

  async _getNftInfoFromSubgraph(type, chain, tokenAddr, owner, limit, skip, includeUri) {
    limit = parseInt(limit || 10);
    skip = parseInt(skip || 0);
    const query = {
      query: `
          query getNftList($tokenAddr: String, $owner: String, $limit: Int, $skip: Int) {
            tokenBalances(first: $limit, skip: $skip, where: {tokenAddr: $tokenAddr, owner: $owner}, orderBy: tokenId, orderDirection: asc) {
              tokenId
              value
            }
          }
        `,
      variables: { tokenAddr, owner, limit, skip }
    };
    let tokens = [];
    let urls = await this.iwan.getRegisteredSubgraph({ chainType: chain, keywords: [tokenAddr] });
    console.debug("get %s token %s subgraph: %O", chain, tokenAddr, urls);
    let res = await axios.post(urls[0].subgraph, JSON.stringify(query));
    if (res && res.data && res.data.data && res.data.data.tokenBalances) {
      tokens = res.data.data.tokenBalances;
    }
    let result = [], uriCalls = [];
    let uriIf = (type === "Erc721") ? "tokenURI(uint256)(string)" : "uri(uint256)(string)";
    tokens.forEach(v => {
      let id = v.tokenId; // hex with 0x
      result.push({ id, balance: v.value });
      if (includeUri !== false) {
        console.log("includeUri");
        uriCalls.push({
          target: tokenAddr,
          call: [uriIf, id],
          returns: [[id]]
        });
      }
    });
    if (uriCalls.length) {
      let res = await this.iwan.multiCall(chain, uriCalls);
      let uris = res.results.transformed;
      result.forEach(v => {
        v.uri = uris[v.id].replace(/\{id\}/g, tool.hexStrip0x(v.id));
        v.id = new BigNumber(v.id).toFixed();
      });
    }
    return result;
  }

  async getErc1155Balance(chain, owner, token) {
    let balance = 0, skip = 0;
    for (; ;) {
      let result = await this.getNftInfo("Erc1155", chain, token, owner, { limit: 1000, skip, includeUri: false });
      let bal = result.length;
      balance += bal;
      if (bal < 1000) {
        break;
      } else {
        skip += bal;
      }
    }
    return balance;
  }

  async getNftAncestorId(chain, tokenAddr, mappingIds) {
    let chainInfo = this.chainInfoService.getChainInfoByType(chain);
    let mcs = mappingIds.map(id => {
      return {
        target: chainInfo.crossScAddr,
        call: ['crossIdToNftBaseInfo(address,uint256)(uint256)', tokenAddr, id],
        returns: [[id]]
      };
    });
    let res = await this.iwan.multiCall(chain, mcs);
    let data = res.results.transformed;
    let ancestorIds = mappingIds.map(id => new BigNumber(data[id]._hex).toFixed());
    return ancestorIds;
  }

  async getNftMappingId(ancestorChain, ancestorTokenAddr, tokenIds) {
    let chainInfo = this.chainInfoService.getChainInfoByType(ancestorChain);
    let mcs = tokenIds.map(id => {
      return {
        target: chainInfo.crossScAddr,
        call: ['crossId(address,uint256)(uint256)', ancestorTokenAddr, id],
        returns: [[id]]
      };
    });
    let res = await this.iwan.multiCall(ancestorChain, mcs);
    let data = res.results.transformed;
    let mappingIds = tokenIds.map(id => new BigNumber(data[id]._hex).toFixed());
    return mappingIds;
  }

  async getCardanoNftInfo(toChainID, policyId, assetNames) {
    let chainInfo = this.chainInfoService.getChainInfoByType("ADA");
    let url = chainInfo.nft.ogmios + "/getNftMetaData";
    let data = {
      ancestorChain: "2147485463", //ADA
      targetChainType: toChainID,
      contractId: policyId,
      tokenIds: assetNames
    };
    let res = await axios.post(url, data);
    let result = res.data || {};
    return result;
  }

  async getCardanoEpochParameters() {
    try {
      let t = await this.iwan.call("getChainTip", { chainType: 'ADA' });
      let p = await this.iwan.getEpochParameters("ADA", { epochID: "latest" });
      let epochParameters = {
        linearFee: {
          minFeeA: p.min_fee_a.toString(),
          minFeeB: p.min_fee_b.toString(),
        },
        minUtxo: p.min_utxo, // p.min_utxo, minUTxOValue protocol paramter has been removed since Alonzo HF. Calulation of minADA works differently now, but 1 minADA still sufficient for now
        poolDeposit: p.pool_deposit,
        keyDeposit: p.key_deposit,
        coinsPerUtxoByte: p.coins_per_utxo_byte,
        coinsPerUtxoWord: p.coins_per_utxo_word,
        maxValSize: p.max_val_size,
        priceMem: p.price_mem,
        priceStep: p.price_step,
        maxTxSize: parseInt(p.max_tx_size),
        slot: t.slot,
        minFeeRefScriptCostPerByte: p.min_fee_ref_script_cost_per_byte
      };
      console.debug("getCardanoEpochParameters: %O", epochParameters);
      return epochParameters;
    } catch (err) {
      console.error("getCardanoEpochParameters error: %O", err);
      throw new Error("Network Instability Detected");
    }
  }

  async getCardanoCostModelParameters() {
    try {
      let p = await this.iwan.getCostModelParameters("ADA", { epochID: "latest" });
      console.debug("getCardanoCostModelParameters: %O", p);
      return p;
    } catch (err) {
      console.error("getCardanoCostModelParameters error: %O", err);
      throw new Error("Network Instability Detected");
    }
  }

  async getChainBlockNumber(chainType, options = {}) {
    if (API_SERVER_SCAN_CHAINS.includes(chainType)) { // scan by apiServer, do not need blockNumber
      return 0;
    }
    try {
      if (chainType === "SUI") { // cursor
        let chainInfo = this.chainInfoService.getChainInfoByType("SUI");
        let scAddr = options.bridge ? chainInfo[options.bridge + 'Bridge'].crossScAddr : chainInfo.crossScAddr;
        let moduleName = options.bridge ? "fee_collector" : "cross";
        let events = await this.iwan.getScEvent("SUI", scAddr, [], { moduleName, order: 'descending', limit: options.rewind || 1 });
        return events.nextCursor;
      } else if (chainType === "TON") { // timestamp in second
        return parseInt(Date.now() / 1000);
      } else { // EVM chains return blockNumber 
        let blockNumber = await this.iwan.getBlockNumber(chainType);
        return blockNumber;
      }
    } catch (err) {
      console.log("%s getChainBlockNumber error: %O", chainType, err);
      return 0; // should retry later
    }
  }

  async getBtcTxSender(chainType, txid) {
    let txInfo = await this.iwan.getTxInfo(chainType, txid, { format: true });
    let inputLen = txInfo.vin.length;
    let sender = "";
    for (let i = 0; i < inputLen; i++) {
      let inputTxInfo = await this.iwan.getTxInfo(chainType, txInfo.vin[i].txid, { format: true });
      let senders = inputTxInfo.vout[txInfo.vin[i].vout].scriptPubKey.addresses;
      if (senders && senders.length) {
        sender = senders[0];
        if (senders.length === 1) {
          break;
        }
      }
    }
    return sender;
  }

  async registerSolWalletAddress(ataAddr, walletAddr) {
    let apiServer = this.configService.getGlobalConfig("apiServer");
    let url = apiServer.url + "/api/sol/addCctpWalletAddr";
    let data = { ataAddr, walletAddr };
    try {
      let ret = await axios.post(url, data);
      if (ret.data.success) {
        console.debug("registerSolWalletAddress: %O", data);
        return;
      } else {
        console.error("registerSolWalletAddress %O error: %O", data, ret);
      }
    } catch (err) {
      console.error("registerSolWalletAddress %O error: %O", data, err);
    }
    throw new Error("Failed to register Solnala wallet address");
  }

  async getSuiCoins(address, coinType = "") {
    let data = [], cursor = "";
    for (; ;) {
      let result = await this.iwan.call("getCoins", { chainType: 'SUI', address, tokenScAddr: coinType, cursor });
      if (result.data.length) {
        data = data.concat(result.data);
      }
      if (result.hasNextPage && result.nextCursor) {
        cursor = result.nextCursor;
      } else {
        break;
      }
    }
    return data;
  }

  async getCctpV2Message(fromChain, txHash) {
    let chainInfo = this.chainInfoService.getChainInfoByType(fromChain);
    let cctpApiUrl = this.configService.getGlobalConfig("cctpApiUrl");
    let url = util.format("%s/v2/messages/%d?transactionHash=%s", cctpApiUrl, chainInfo.CircleBridge.domain, txHash);
    let res = await axios.get(url);
    return res && res.data && res.data.messages && res.data.messages[0];
  }

  async parseCctpDeposit(fromChain, txHash, options) {
    let result = {};
    if (options.isV2) { // v2 is common for evm and other chains
      let msg = await this.getCctpV2Message(fromChain, txHash);
      if (msg) {
        if (msg.eventNonce && msg.decodedMessage) {
          result.depositNonce = msg.eventNonce;
          result.depositAmount = msg.decodedMessage.decodedMessageBody.amount;
        } else if (msg.attestation === "PENDING") {
          console.debug("parseCctpV2Deposit for chain %s tx %s pending: %s", fromChain, txHash, msg.delayReason);
        }
      }
    } else if (fromChain === "NOBLE") {
      let receipt = await this.iwan.getTransactionReceipt(fromChain, txHash);
      let event = receipt.events.find(v => (v.type === "circle.cctp.v1.DepositForBurn"));
      if (event) {
        console.debug("parseCctpDeposit for chain %s tx %s: %O", fromChain, txHash, event);
        let nonce = null, amount = null;
        for (let attr of event.attributes) {
          if (attr.key === "nonce") {
            nonce = attr.value; // string
          } else if (attr.key === "amount") {
            amount = attr.value; // string
          }
          if (nonce && amount) {
            result.depositNonce = nonce.replace(/\"/g, "");
            result.depositAmount = amount.replace(/\"/g, "");
            break;
          }
        }
      }
    } else if (fromChain === "SOL") {
      let depositMsg = await this.iwan.parseCctpMessageSent("SOL", options.ota);
      let sol = this.configService.getExtension("SOL");
      let cctpMsg = sol.tool.parseCctpDepositMessage(depositMsg);
      console.log("SOL tx %s evnet %s cctpMsg: %O", txHash, options.ota, cctpMsg);
      if (cctpMsg) {
        result.depositNonce = parseInt("0x" + cctpMsg.nonce.toString("hex"));
        result.depositAmount = parseInt("0x" + cctpMsg.amount.toString("hex"));
      }
    } else if (fromChain === "SUI") {
      let chainInfo = this.chainInfoService.getChainInfoByType("SUI");
      let receipt = await this.iwan.getTransactionReceipt(fromChain, txHash);
      let depositMsg = chainInfo.CircleBridge.messageTransmitter + "::send_message::MessageSent";
      let depositEvent = receipt.events.find(v => ((v.transactionModule === "deposit_for_burn") && (v.type === depositMsg)));
      if (depositEvent) {
        console.log("SUI %s get depositEvent: %O", txHash, depositEvent);
        let sui = this.configService.getExtension("SUI");
        let cctpMsg = sui.tool.parseCctpDepositMessage(depositEvent.parsedJson.message);
        console.log("SUI tx %s cctpMsg: %O", txHash, cctpMsg);
        if (cctpMsg) {
          result.depositNonce = cctpMsg.nonce;
          result.depositAmount = cctpMsg.amount;
        }
      }
    } else { // evm v1
      let receipt = await this.iwan.getTransactionReceipt(fromChain, txHash);
      for (let log of receipt.logs) {
        if (log.topics[0] === CctpEvmDepositEventHash) {
          let abi = this.configService.getAbi("cctpTokenMessenger");
          let decoded = tool.parseEvmLog(log, abi);
          console.debug("parseCctpDeposit for chain %s tx %s: %O", fromChain, txHash, decoded);
          result.depositNonce = decoded.args.nonce;
          result.depositAmount = decoded.args.amount;
          break;
        }
      }
    }
    return result;
  }

  async getRewardTasks(page, pageSize, options) {
    let args, tasks;
    let abi = this.configService.getAbi("rewardTask");
    if (options.claimer) {
      args = [options.claimer, page, pageSize];
      tasks = await this.iwan.callScFunc("WAN", this.crossTaskCfg.scAddr, "getReversePageUserTasks", args, abi);
    } else {
      args = [page, pageSize];
      tasks = await this.iwan.callScFunc("WAN", this.crossTaskCfg.scAddr, "getReversePageTasks", args, abi);
    }
    return tasks.map(t => this.formatRewardTask(t)).filter(v => v);
  }
  async getRewardTask(taskId) {
    let abi = this.configService.getAbi("rewardTask");
    let task = await this.iwan.callScFunc("WAN", this.crossTaskCfg.scAddr, "getTaskById", [taskId], abi);
    if (task[17] != 0) { // status
      return this.formatRewardTask(task);
    } else {
      return null;
    }
  }

  formatRewardTask(task) {
    try {
      let tokenPairService = this.frameworkService.getService("TokenPairService");
      let tokenPairID = task[2];
      let fromChainId = task[3];
      let tp = tokenPairService.getTokenPair(tokenPairID);
      let fromChain, toChain, decimals, tpDestChainId;
      if (fromChainId === tp.fromChainID) {
        fromChain = tp.fromChainName;
        toChain = tp.toChainName;
        decimals = tp.fromDecimals;
        tpDestChainId = tp.toChainID;
      } else {
        fromChain = tp.toChainName;
        toChain = tp.fromChainName;
        decimals = tp.toDecimals;
        tpDestChainId = tp.fromChainID;
      }
      let deadline = Number(task[7]);
      let status = Number(task[17]);
      if ([1, 2].includes(status)) { // Created, InProgress
        if (parseInt(Date.now() / 1000) >= deadline) {
          status = 4; // Expired
        }
      }
      let rewardToken = this.getRewardTaskTokenInfo("WAN", task[8]);
      return {
        id: Number(task[0]),
        name: task[1],
        createdAt: Number(task[6]),
        deadline,
        cross: {
          tokenPairID,
          fromChain,
          toChain,
          symbol: tp.readableSymbol,
          amount: task[5],
          decimals: Number(decimals)
        },
        reward: {
          token: task[8].toLowerCase(),
          symbol: rewardToken.symbol,
          amount: task[9],
          decimals: rewardToken.decimals
        },
        collateral: task[10].map(c => {
          let collateralToken = this.getRewardTaskTokenInfo("WAN", c[0]);
          return {
            token: c[0],
            symbol: collateralToken.symbol,
            amount: c[1],
            decimals: collateralToken.decimals,
            usage: Number(c[2])
          };
        }),
        creator: task[11],
        claimer: (task[12] !== "0x0000000000000000000000000000000000000000") ? task[12] : "",
        claimedAt: Number(task[13]),
        collateralId: Number(task[14]),
        completedAt: Number(task[15]),
        finishTxHash: task[16] !== "0x" ? task[16] : "",
        status
      };
    } catch (err) { // reward and collateral tokens maybe not defined in sdk
      console.error("formatRewardTask error: %s, %O", err, task);
      return null;
    }
  }

  getRewardTaskTokenInfo(chainType, tokenAddr) {
    tokenAddr = tokenAddr.toLowerCase();
    let info = this.crossTaskCfg.tokens[tokenAddr];
    if (!info) {
      let tokenPairService = this.frameworkService.getService("TokenPairService");
      info = tokenPairService.getTokenInfo(chainType, tokenAddr);
    }
    return info;
  }

  async waitTxReceipt(chainType, txHash, timeout = 0, interval = 3000) {
    let t0 = Date.now();
    for (; ;) {
      try {
        let receipt = await this.iwan.getTransactionReceipt(chainType, txHash);
        if (receipt) {
          return receipt;
        }
      } catch (err) {
        // console.error("waitTxReceipt error: %O", err);
      }
      if ((Date.now() - t0) < timeout) {
        await tool.sleep(interval);
      } else {
        console.debug("waitTxReceipt %d ms unavailable", timeout);
        return null;
      }
    }
  }
}

export default StoremanService;
