"use strict";

const BigNumber = require("bignumber.js");
const tool = require("../../utils/tool");
const axios = require("axios");

const SELF_WALLET_COIN_BALANCE_CHAINS = ["ADA"];
const IWAN_TOKEN_BALANCE_NONEVM_CHAINS = ["ALGO"];
const API_SERVER_SCAN_CHAINS = ["XRP", "DOT", "ADA", "PHA", "ATOM", "NOBLE", "SOL"];

class StoremanService {
    constructor() {
    }

    async init(frameworkService, options) {
      this.isTestMode = options.isTestMode || false;
      this.frameworkService = frameworkService;
      this.iwan = frameworkService.getService("iWanConnectorService");
      this.chainInfoService = frameworkService.getService("ChainInfoService");
      this.configService = frameworkService.getService("ConfigService");
    }

    async getStroremanGroupQuotaInfo(fromChainType, tokenPairId, storemanGroupId) {
      try {
        let tokenPairService = this.frameworkService.getService("TokenPairService");
        let tokenPair = tokenPairService.getTokenPair(tokenPairId);
        if (tokenPair) {
          let toChainType = (fromChainType === tokenPair.fromChainType)? tokenPair.toChainType : tokenPair.fromChainType;
          let decimals = (fromChainType === tokenPair.fromChainType)? tokenPair.fromDecimals : tokenPair.toDecimals;
          if (tokenPair.ancestorSymbol === "EOS" && tokenPair.fromChainType === fromChainType) {
            // wanEOS特殊处理wan -> eth mint storeman采用旧的处理方式
            fromChainType = "EOS";
          }
          let minAmountChain = toChainType;
          if (tokenPair.fromAccount == 0) {
            minAmountChain = tokenPair.fromChainType;
          } else if (tokenPair.toAccount == 0) {
            minAmountChain = tokenPair.toChainType;
          }
          let minAmountDecimals = (minAmountChain === tokenPair.fromChainType)? tokenPair.fromDecimals : tokenPair.toDecimals;
          let network = this.configService.getNetwork();
          let ignoreReservation = (this.isTestMode && (network === "mainnet"));
          let [quota, min] = await Promise.all([
            this.iwan.getStoremanGroupQuota(fromChainType, storemanGroupId, [tokenPair.ancestorSymbol], toChainType, ignoreReservation),
            this.iwan.getMinCrossChainAmount(minAmountChain, tokenPair.ancestorSymbol)
          ]);
          // console.debug("getStroremanGroupQuotaInfo: %s, %s, %s, %s, %O", fromChainType, storemanGroupId, tokenPair.ancestorSymbol, toChainType, quota);
          let maxQuota = new BigNumber(quota[0].maxQuota).div(Math.pow(10, parseInt(decimals)));
          let minQuota = new BigNumber(min[tokenPair.ancestorSymbol]).div(Math.pow(10, parseInt(minAmountDecimals)));
          return {maxQuota: maxQuota.toFixed(), minQuota: minQuota.toFixed()};
        }
      } catch (err) {
        console.error("getStroremanGroupQuotaInfo error: %O", err);
      }
      return {maxQuota: "0", minQuota: "0"};
    }

    validateAddress(chainType, address) {
      let result;
      let extension = this.configService.getExtension(chainType);
      let network = this.configService.getNetwork();
      if (extension && extension.tool && extension.tool.validateAddress) {
        result = extension.tool.validateAddress(address, network, chainType);
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
      } else { // default as EVM
        result = tool.isValidEthAddress(address);
      }
      return result;
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
        let tokenAccount = direction? tokenPair.fromAccount : tokenPair.toAccount;
        let chainInfo = this.chainInfoService.getChainInfoByType(chainType);
        let isCoin = options.isCoin || (tokenAccount === "0x0000000000000000000000000000000000000000");
        if (isCoin) {
          decimals = direction? tokenPair.fromScInfo.chainDecimals : tokenPair.toScInfo.chainDecimals;
          if (SELF_WALLET_COIN_BALANCE_CHAINS.includes(chainType)) {
            if (options.wallet) {
              // ogmius only provide pure ADA utxo balance
              balance = await options.wallet.getBalance(addr);
            }
          } else {
            balance = await this.iwan.getBalance(chainType, addr);
          }
        } else {
          decimals = direction? tokenPair.fromDecimals : tokenPair.toDecimals;
          if (tokenPair.protocol === "Erc1155") {
            balance = await this.getErc1155Balance(chainType, addr, tokenAccount);
          } else { // Erc20, Erc721
            if (chainInfo._isEVM) {
              balance = await this.iwan.getTokenBalance(chainType, addr, tokenAccount);
            } else if (IWAN_TOKEN_BALANCE_NONEVM_CHAINS.includes(chainType)) {
              // ALGO do not need format tokenAccount
              balance = await this.iwan.getTokenBalance(chainType, addr, tokenAccount);
            } else if (options.wallet) {
              balance = await options.wallet.getBalance(addr, tool.ascii2letter(tool.hexStrip0x(tokenAccount)));
            }
          }
        }
        balance = new BigNumber(balance).div(Math.pow(10, decimals));
        console.debug("get tokenPair %s chain %s %s address %s balance: %s", assetPairId, chainType, isCoin? "coin" : ("token " + tokenAccount), addr, balance.toFixed());
        return balance;
      } catch (err) {
        console.error("get tokenPair %s %s address %s balance error: %O", assetPairId, chainType, addr, err);
        return new BigNumber(0);
      }
    }

    async getAccountBalances(chainType, addr, assets, options) {
      let chainInfo = this.chainInfoService.getChainInfoByType(chainType);
      let result = {};
      if (chainInfo._isEVM) { // evm support multicall, include Tron
        let evmAddress = tool.getStandardAddressInfo(chainType, addr, this.configService.getExtension(chainType)).evm;
        if (tool.isValidEthAddress(evmAddress)) {
          let mcs = [], subgraphs = [];
          for (let asset in assets) {
            let tokenInfo = assets[asset];
            if (tokenInfo.protocol === "Erc1155") {
              subgraphs.push({asset, call: this.getErc1155Balance(chainType, addr, tokenInfo.address)});
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
          };
          // multicall
          let res;
          if (mcs.length) {
            res = await this.iwan.multiCall(chainType, mcs);
            let balances = res.results.transformed;
            mcs.forEach(mc => {
              let asset = mc.returns[0][0];
              let tokenInfo = assets[asset];
              let balance = balances[asset];
              if (typeof(balance) === "string") { // Tron
                // do nothing
              } else if (typeof(balance._hex) === "string") { // other EVMs
                balance = balance._hex;
              } else {
                console.error("unrecognized %s %s balance: %O", chainType, asset, balance);
                balance = "";
                return;
              }
              result[asset] = new BigNumber(balance).div(Math.pow(10, tokenInfo.decimals)).toString();
            })
          }
          // subgraph
          if (subgraphs.length) {
            res = await Promise.all(subgraphs.map(v => v.call));
            res.forEach((v, i) => result[subgraphs[i].asset] = v);
          }
        }
      } else if (IWAN_TOKEN_BALANCE_NONEVM_CHAINS.includes(chainType)) { // format of non-evm chains is different and needs to parse separately
        if (this.validateAddress(chainType, addr)) {
          if (chainType === "ALGO") {
            let balances = await this.iwan.getAllBalances(chainType, addr);
            let bMap = new Map();
            balances.forEach(v => bMap.set(v.assetId, v.amount));
            for (let asset in assets) {
              let tokenInfo = assets[asset]; // include coin
              result[asset] = new BigNumber(bMap.get(Number(tokenInfo.address)) || 0).div(Math.pow(10, tokenInfo.decimals)).toString();
            }
          }
        }
      } else if (options.wallet) {
        if (this.validateAddress(chainType, addr)) {
          let assetArray = [], balances;
          try { // input addr format maybe not match wallet
            if (options.wallet.getBalances) { // fix cardano Eternl too many requests error
              let tokens = []; // includes coin
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
              result[asset] = new BigNumber(balances[i]).div(Math.pow(10, assets[asset].decimals)).toString();
            }
          } catch (err) {
            console.error("get %s %s balances error: %O", chainType, addr, err);
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
      if (options.tokenIds) {
        return this._getNftInfoFromChain(type, chain, tokenAddr, owner, options.tokenIds);
      } else {
        return this._getNftInfoFromSubgraph(type, chain, tokenAddr, owner, options.limit, options.skip, options.includeUri);
      }
    }

    async _getNftInfoFromChain(type, chain, tokenAddr, owner, tokenIds) {
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
        let uriIf = (type === "Erc721")? "tokenURI(uint256)(string)" : "uri(uint256)(string)";
        mcs.push({
          target: tokenAddr,
          call: [uriIf, id],
          returns: [[id + "-uri"]]
        });
      })
      if (mcs.length) {
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
            if (balance.gt(0)) {
              let fullId = (Array(63).fill('0').join("") + tool.hexStrip0x(id)).slice(-64);
              result.push({
                id: new BigNumber(id).toFixed(),
                balance: balance.toFixed(),
                uri: data[id + "-uri"].replace(/\{id\}/g, fullId)
              })
            } else {
              console.debug("%s does not own %s %s token %s id %s", owner, chain, type, tokenAddr, v);
            }
          })
        } catch (err) { // erc721 would throw error if query nonexistent token
          console.debug("getNftInfoFromChain error: %O", err);
        }
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
        variables: {tokenAddr, owner, limit, skip}
      };
      let tokens = [];
      let urls = await this.iwan.getRegisteredSubgraph({chainType: chain, keywords: [tokenAddr]});
      console.debug("get %s token %s subgraph: %O", chain, tokenAddr, urls);
      let res = await axios.post(urls[0].subgraph, JSON.stringify(query));
      if (res && res.data && res.data.data && res.data.data.tokenBalances) {
        tokens = res.data.data.tokenBalances;
      }
      let result = [], uriCalls = [];
      let uriIf = (type === "Erc721")? "tokenURI(uint256)(string)" : "uri(uint256)(string)";
      tokens.forEach(v => {
        let id = v.tokenId; // hex with 0x
        result.push({id, balance: v.value});
        if (includeUri !== false) {
          console.log("includeUri");
          uriCalls.push({
            target: tokenAddr,
            call: [uriIf, id],
            returns: [[id]]
          });
        }
      })
      if (uriCalls.length) {
        let res = await this.iwan.multiCall(chain, uriCalls);
        let uris = res.results.transformed;
        result.forEach(v => {
          v.uri = uris[v.id].replace(/\{id\}/g, tool.hexStrip0x(v.id));
          v.id = new BigNumber(v.id).toFixed();
        })
      }
      return result;
    }

    async getErc1155Balance(chain, owner, token) {
      let balance = 0, skip = 0;
      for ( ; ; ) {
        let result = await this.getNftInfo("Erc1155", chain, token, owner, {limit: 1000, skip, includeUri: false});
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

    async getCardanoEpochParameters() {
      try {
        let latestBlock = await this.iwan.getLatestBlock("ADA");
        let p = await this.iwan.getEpochParameters("ADA", {epochID: "latest"});
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
          slot: parseInt(latestBlock.slot),
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
        let p = await this.iwan.getCostModelParameters("ADA", {epochID: "latest"});
        console.debug("getCardanoCostModelParameters: %O", p);
        return p;
      } catch (err) {
        console.error("getCardanoCostModelParameters error: %O", err);
        throw new Error("Network Instability Detected");
      }
    }

    async getChainBlockNumber(chainType) {
      if (API_SERVER_SCAN_CHAINS.includes(chainType)) { // scan by apiServer, do not need blockNumber
        return 0;
      }
      // only for EVM chains
      try {
        let blockNumber = await this.iwan.getBlockNumber(chainType);
        return blockNumber;
      } catch (err) {
        console.log("%s getChainBlockNumber error: %O", chainType, err);
        return 0; // should retry later
      }
    }

    async getBtcTxSender(chainType, txid) {
      let txInfo = await this.iwan.getTxInfo(chainType, txid, {format: true});
      let inputLen = txInfo.vin.length;
      let sender = "";
      for (let i = 0; i < inputLen; i++) {
          let inputTxInfo = await this.iwan.getTxInfo(chainType, txInfo.vin[i].txid, {format: true});
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
}

module.exports = StoremanService;