"use strict";

const BigNumber = require("bignumber.js");
const tool = require("../../utils/tool");
const axios = require("axios");

const SELF_WALLET_BALANCE_CHAINS = ["DOT", "ADA"]; // TRX has self wallet but also be supported by rpc 

class StoremanService {
    constructor() {
    }

    async init(frameworkService) {
        try {
            this.m_frameworkService = frameworkService;
            this.m_iwanBCConnector = frameworkService.getService("iWanConnectorService");
        } catch (err) {
            console.log("StoremanService init err:", err);
        }
    }

    async getStroremanGroupQuotaInfo(fromChainType, tokenPairId, storemanGroupId) {
        try {
            let tokenPairService = this.m_frameworkService.getService("TokenPairService");
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
                let [quota, min] = await Promise.all([
                    this.m_iwanBCConnector.getStoremanGroupQuota(fromChainType, storemanGroupId, [tokenPair.ancestorSymbol], toChainType),
                    this.m_iwanBCConnector.getMinCrossChainAmount(minAmountChain, tokenPair.ancestorSymbol)
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

    async getConvertInfo(convertJson) {
        let cctHandleService = this.m_frameworkService.getService("CCTHandleService");
        return cctHandleService.getConvertInfo(convertJson);
    }

    async processTxTask(taskParas, wallet) {
        let txTaskHandleService = this.m_frameworkService.getService("TxTaskHandleService");
        return txTaskHandleService.processTxTask(taskParas, wallet);
    }

    async getAccountBalance(assetPairId, type, addr, options = {}) {
        try {
            let tokenPairService = this.m_frameworkService.getService("TokenPairService");
            let tokenPair = tokenPairService.getTokenPair(assetPairId);
            if (!tokenPair) {
                return new BigNumber(0);
            }
            let balance, decimals, kaChainInfo = null;
            let wallet = options.wallet; // third party wallet is required
            if (options.isCoin) {
                if (type === "MINT") {
                    if (SELF_WALLET_BALANCE_CHAINS.includes(tokenPair.fromChainType)) {
                        balance = await wallet.getBalance(addr);
                    } else {
                        balance = await this.m_iwanBCConnector.getBalance(tokenPair.fromChainType, addr);
                    }
                    kaChainInfo = tokenPair.fromScInfo;
                    decimals = tokenPair.fromScInfo.chainDecimals;
                } else if (type === "BURN") {
                    if (SELF_WALLET_BALANCE_CHAINS.includes(tokenPair.toChainType)) {
                        balance = await wallet.getBalance(addr);
                    } else {
                        balance = await this.m_iwanBCConnector.getBalance(tokenPair.toChainType, addr);
                    }
                    decimals = tokenPair.toScInfo.chainDecimals;
                }
            } else {
                if (type === "MINT") {
                    if (tokenPair.fromAccount === "0x0000000000000000000000000000000000000000") {
                        // COIN
                        if (SELF_WALLET_BALANCE_CHAINS.includes(tokenPair.fromChainType)) {
                            balance = await wallet.getBalance(addr);
                        } else {
                            balance = await this.m_iwanBCConnector.getBalance(tokenPair.fromChainType, addr);
                        }
                        kaChainInfo = tokenPair.fromScInfo;
                    } else if (tokenPair.fromAccountType === "Erc1155") {
                        balance = await this.getErc1155Balance(tokenPair.fromChainType, addr, tokenPair.fromAccount);
                    } else {
                        balance = await this.m_iwanBCConnector.getTokenBalance(tokenPair.fromChainType, addr, tokenPair.fromAccount);
                    }
                    decimals = tokenPair.fromDecimals;
                } else if (type === "BURN") {
                    if (tokenPair.toAccountType === "Erc1155") {
                        balance = await this.getErc1155Balance(tokenPair.toChainType, addr, tokenPair.toAccount);
                    } else {
                        balance = await this.m_iwanBCConnector.getTokenBalance(tokenPair.toChainType, addr, tokenPair.toAccount);
                    }
                    decimals = tokenPair.toDecimals;
                }
            }
            balance = new BigNumber(balance).div(Math.pow(10, decimals));
            if (kaChainInfo && options.keepAlive) {
                if (kaChainInfo.minReserved) {
                    balance = balance.minus(kaChainInfo.minReserved);
                    if (balance.lt(0)) {
                        balance = new BigNumber(0);
                    }
                }
            }
            return balance;
        } catch (err) {
            console.error("get tokenPair %s type %s address %s balance error: %O", assetPairId, type, addr, err);
            return new BigNumber(0);
        }
    }

    getTokenPair(tokenPairId) {
        let tokenPairService = this.m_frameworkService.getService("TokenPairService");
        return tokenPairService.getTokenPair(tokenPairId);
    }

    getTokenEventType(tokenPairId, direction) {
      let tokenPairService = this.m_frameworkService.getService("TokenPairService");
      return tokenPairService.getTokenEventType(tokenPairId, direction);
    }

    async updateSmgs() {
        let tokenPairService = this.m_frameworkService.getService("TokenPairService");
        return tokenPairService.updateSmgs();
    }

    getAssetLogo(name) {
      let tokenPairService = this.m_frameworkService.getService("TokenPairService");
      return tokenPairService.getAssetLogo(name);
    }

    getChainLogo(chainType) {
      let tokenPairService = this.m_frameworkService.getService("TokenPairService");
      return tokenPairService.getChainLogo(chainType);
    }

    async getXrpTokenTrustLine(tokenAccount, userAccount) {
      let [currency, issuer] = tool.parseXrpTokenPairAccount(tokenAccount, false);
      let lines = await this.m_iwanBCConnector.getTrustLines(userAccount);
      let line = lines.find(v => (v.account === issuer) && (v.currency === currency));
      if (line) {
        return {
          limit: new BigNumber(line.limit),
          balance: new BigNumber(line.balance)
        };
      }
      return null;
    }

    async getNftInfo(type, chain, tokenAddr, owner, limit, skip = 0, includeUri = true) {
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
      let urls = await this.m_iwanBCConnector.getRegisteredSubgraph({chainType: chain, keywords: [tokenAddr]});
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
        if (includeUri) {
          let call = {
            target: tokenAddr,
            call: [uriIf, id],
            returns: [[id]]
          }
          uriCalls.push(call);
        }
      })
      if (uriCalls.length) {
        let res = await this.m_iwanBCConnector.multiCall(chain, uriCalls);
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
        let result = await this.getNftInfo("Erc1155", chain, token, owner, 1000, skip, false);
        let bal = Object.keys(result).length;
        balance += bal;
        if (bal < 1000) {
          break;
        } else {
          skip += bal;
        }
      }
      return balance;
    }
};

module.exports = StoremanService;