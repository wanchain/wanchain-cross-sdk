'use strict';

const iWanClient = require('../libs/iWan-js-sdk/apis/apiInstance.js');
const tool = require('../../utils/tool.js');

class IWanBCConnector {
    constructor(option) {
        this.m_iWanOption = option;
        this.apiClient = null;
        this.m_biWanConnected = false;
    }

    async init(frameworkService) {
        this.m_frameworkService = frameworkService;
        this.m_eventService = frameworkService.getService("EventService");
        this.configService = this.m_frameworkService.getService("ConfigService");

        let iwanInstAry = [];
        for (let idx = 0; idx < this.m_iWanOption.options.length; ++idx) {
            let apiInst = new iWanClient(this.m_iWanOption.apiKey, this.m_iWanOption.secretKey, this.m_iWanOption.options[idx]);
            if (idx === 0) {
                this.apiClient = apiInst;
            }
            iwanInstAry.push(apiInst);
        }

        let checkiwanSpeed = frameworkService.getService("CheckiWanSpeed");
        checkiwanSpeed.checkiwanSpeed(iwanInstAry, this.oniwanCheckSpeedSuccess.bind(this), this.oniwanCheckSpeedFail.bind(this));
    }

    async onConnect() {
        if (this.m_biWanConnected === false) {
            this.m_biWanConnected = true;
            await this.m_eventService.emitEvent("iwanConnected");
        }
    }

    async isConnected() {
        return this.m_biWanConnected;
    }

    async oniwanCheckSpeedSuccess(iwanInstAry, iwanInstance) {
        console.log("oniwanCheckSpeedSuccess");
        this.apiClient = iwanInstance;
        await this.onConnect();
        await this.closeOtherIwan(iwanInstAry, this.apiClient);
    }

    async oniwanCheckSpeedFail(iwanInstAry) {
        console.error("oniwanCheckSpeedFail");
        await this.apiClient.addConnectNotify(this.onConnect.bind(this));
        await this.closeOtherIwan(iwanInstAry, this.apiClient);
    }

    async closeOtherIwan(iwanInstAry, iwanInst) {
        for (let idx = 0; idx < iwanInstAry.length; ++idx) {
            let inst = iwanInstAry[idx];
            if (inst !== iwanInst) {
                //console.log("closeOtherIwan close idx:", idx);
                inst.close();
            }
        }
    }

    async getBlockNumber(chain){
        let ret = await this.apiClient.getBlockNumber(chain);
        return ret;
    }

    async getLedgerVersion(chain) {
        let ret = await this.apiClient.getLedgerVersion(chain);
        return ret;
    }

    async getBalance(chain, addr) {
        let ret = await this.apiClient.getBalance(chain, addr);
        return ret;
    }

    async getMultiBalance(chain, addrArray) {
        let ret = await this.apiClient.getMultiBalances(chain, addrArray);
        return ret;
    }

    async getGasPrice(chain) {
        let ret = await this.apiClient.getGasPrice(chain);
        return ret;
    }

    async getNonce(chain, addr) {
        let ret = await this.apiClient.getNonce(chain, addr);
        return ret;
    }

    async estimateGas(chain, txObject) {
        let ret = await this.apiClient.estimateGas(chain, txObject);
        return ret;
    }

    async sendRawTransaction(chain, signedTx) {
        let ret = await this.apiClient.sendRawTransaction(chain, signedTx);
        return ret;
    }

    async getTransactionReceipt(chain,txHash){
        let ret = await this.apiClient.getTransactionReceipt(chain,txHash);
        return ret;
    }

    async getChainInfo(chain) {
        let ret = await this.apiClient.getChainInfo(chain);
        return ret;
    }

    async getChainConstantInfo(options) {
        try {
            console.log("getChainConstantInfo options:", options);
            let ret = await this.apiClient.getChainConstantInfo(options);
            return ret;
        }
        catch (err) {
            console.log("IWanBCConnector getChainConstantInfo err:", err);
        }
    }

    async getTokenPairs(options) {
        let ret = await this.apiClient.getTokenPairs(options);
        return ret;
    }

    async getStoremanGroupList(chainIds) {
        let ret = await this.apiClient.getStoremanGroupList(chainIds);
        return ret;
    }

    async callScFunc(chain, scAddr, name, args, abi) {
        let ret = await this.apiClient.callScFunc(chain, scAddr, name, args, abi);
        return ret;
    }

    async getTokenPairInfo(tokenPairId) {
        let ret = await this.apiClient.getTokenPairInfo(tokenPairId);
        return ret;
    }

    async getTokenPairIDs(options) {
        let ret = await this.apiClient.getTokenPairIDs(options);
        return ret;
    }

    async getTokenInfo(chain, tokenAddr, tokenType) {
        let options = tokenType? {tokenType} : undefined;
        let ret = await this.apiClient.getTokenInfo(chain, tokenAddr, options);
        return ret;
    }

    async getMultiTokenInfo(chain, tokenScAddrArray, tokenType) {
      let options = tokenType? {tokenType} : undefined;
      let ret = await this.apiClient.getMultiTokenInfo(chain, tokenScAddrArray, options);
      return ret;
    }

    async getTokenBalance(chain, accountAddr, tokenAddr) {
        let ret = await this.apiClient.getTokenBalance(chain, accountAddr, tokenAddr);
        return ret;
    }

    async getErc20Allowance(chain, scAddr, ownerAddr, spenderAddr) {
      let ret = await this.apiClient.getTokenAllowance(chain, scAddr, ownerAddr, spenderAddr);
      return ret;
    }

    async getScEvent(chainType, address, topics, option) {
        let ret = await this.apiClient.getScEvent(chainType, address, topics, option);
        return ret;
    }

    async getStoremanGroupQuota(chainType, groupId, symbol, targetChainType) {
        let ret = await this.apiClient.getStoremanGroupQuota(chainType, groupId, symbol, targetChainType);
        return ret;
    }

    async getMinCrossChainAmount(targetChainType, symbol) {
        let ret = await this.apiClient.getMinCrossChainAmount(targetChainType, [symbol]);
        return ret;
    }

    async getTxInfo(chain, txHash, options) {
        let ret = await this.apiClient.getTxInfo(chain, txHash, options);
        return ret;
    }

    async getStoremanGroupConfig(storemanGroupId) {
        return await this.apiClient.getStoremanGroupConfig(storemanGroupId);
    }

    async checkErc721Approved(chain, token, id, owner, operator) {
        let abi = this.configService.getAbi("erc721");
        let [isApprovedForAll, getApproved] = await Promise.all([
            this.apiClient.callScFunc(chain, token, "isApprovedForAll", [owner, operator], abi),
            this.apiClient.callScFunc(chain, token, "getApproved", [id], abi)
        ]);
        return (isApprovedForAll || (getApproved.toLowerCase() === operator.toLowerCase()));
    }

    async checkErc721Ownership(chain, token, id, address) {
        let abi = this.configService.getAbi("erc721");
        let owner = await this.apiClient.callScFunc(chain, token, "ownerOf", [id], abi);
        return (owner.toLowerCase() === address.toLowerCase());
    }

    async getNftInfoMulticall(ancestorChainType, ancestorChainToken, chain, token, owner, startIndex, endIndex) {
        let idCalls = [];
        for (let i = startIndex; i <= endIndex; i++) {
            let call = {
              target: token,
              call: ['tokenOfOwnerByIndex(address,uint256)(uint256)', owner, i],
              returns: [[i]]
            }
            idCalls.push(call);
        }
        let ids = await this.apiClient.multiCall(chain, idCalls);
        let uriCalls = [];
        for (let i = startIndex; i <= endIndex; i++) {
            let call = {
              target: ancestorChainToken,
              call: ['tokenURI(uint256)(string)', ids.results.transformed[i]._hex],
              returns: [[i]]
            }
            uriCalls.push(call);
        }
        let uris = await this.apiClient.multiCall(ancestorChainType, uriCalls);
        let result = {};
        for (let i = startIndex; i <= endIndex; i++) {
            result[i] = {id: ids.results.transformed[i]._hex, uri: uris.results.transformed[i]};
        }
        return result;
    }

    async estimateCrossChainOperationFee(chainType, targetChainType, options) {
        return this.apiClient.estimateCrossChainOperationFee(chainType, targetChainType, options);
    }

    async estimateCrossChainNetworkFee(chainType, targetChainType, options) {
        return this.apiClient.estimateCrossChainNetworkFee(chainType, targetChainType, options);
    }

    async getLatestBlock(chainType) {
        return this.apiClient.getLatestBlock(chainType);
    }

    async getEpochParameters(chainType, options) {
        return this.apiClient.getEpochParameters(chainType, options);
    }

    async getRegisteredTokenLogo(chainType, options) {
      return this.apiClient.getRegisteredTokenLogo(chainType, options);
    }

    async getTokenPairsHash(options) {
      return this.apiClient.getTokenPairsHash(options);
    }

    async getRegisteredChainLogo(options) {
      return this.apiClient.getRegisteredChainLogo(options);
    }

    async getRegisteredMultiChainOrigToken(options) {
      return this.apiClient.getRegisteredMultiChainOrigToken(options);
    }

    async getTrustLines(address, options) {
      return this.apiClient.getTrustLines("XRP", address, options);
    }
};

module.exports = IWanBCConnector;

