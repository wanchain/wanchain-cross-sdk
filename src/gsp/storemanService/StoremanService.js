"use strict";

const BigNumber = require("bignumber.js");
const tool = require("../../utils/tool");
const axios = require("axios");

const SELF_WALLET_BALANCE_CHAINS = ["DOT", "ADA", "PHA"]; // TRX has self wallet but also be supported by rpc

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

    async getAccountAsset(assetPairId, type, addr, options = {}) {
        try {
            let tokenPairService = this.m_frameworkService.getService("TokenPairService");
            let tokenPair = tokenPairService.getTokenPair(assetPairId);
            if (!tokenPair) {
                return new BigNumber(0);
            }
            let balance, decimals;
            let chainType = (type === "MINT")? tokenPair.fromChainType : tokenPair.toChainType;
            let kaChainInfo = (type === "MINT")? tokenPair.fromScInfo : tokenPair.toScInfo;
            if (options.isCoin) { // isCoin is internal use only
                decimals = (type === "MINT")? tokenPair.fromScInfo.chainDecimals : tokenPair.toScInfo.chainDecimals;
                if (SELF_WALLET_BALANCE_CHAINS.includes(chainType)) {
                    balance = options.wallet? (await options.wallet.getBalance(addr)) : 0;
                } else {
                    balance = await this.m_iwanBCConnector.getBalance(chainType, addr);
                }
            } else {
                decimals = (type === "MINT")? tokenPair.fromDecimals : tokenPair.toDecimals;
                let tokenAccount = (type === "MINT")? tokenPair.fromAccount : tokenPair.toAccount;
                let tokenType = (type === "MINT")? tokenPair.fromAccountType : tokenPair.toAccountType;
                if (tokenAccount === "0x0000000000000000000000000000000000000000") { // coin
                    if (SELF_WALLET_BALANCE_CHAINS.includes(chainType)) {
                        balance = options.wallet? (await options.wallet.getBalance(addr)) : 0;
                    } else {
                        balance = await this.m_iwanBCConnector.getBalance(chainType, addr);
                    }
                } else if (tokenType === "Erc1155") {
                    balance = await this.getErc1155Balance(chainType, addr, tokenAccount);
                } else {
                    balance = await this.m_iwanBCConnector.getTokenBalance(chainType, addr, tokenAccount);
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
          let res = await this.m_iwanBCConnector.multiCall(chain, mcs);
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
};

module.exports = StoremanService;
