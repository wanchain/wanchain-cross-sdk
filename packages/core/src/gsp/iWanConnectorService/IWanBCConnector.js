'use strict';

const iWanClient = require('../libs/iWan-js-sdk/apis/apiInstance.js');

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

    async getBalance(chain, addr) {
        let ret = await this.apiClient.getBalance(chain, addr);
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

    async getTransactionReceipt(chain,txHash){
        let ret = await this.apiClient.getTransactionReceipt(chain,txHash);
        return ret;
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

    async getStoremanGroupQuota(chainType, groupId, symbol, targetChainType, ignoreReservation = false) {
        let ret = await this.apiClient.getStoremanGroupQuota(chainType, groupId, symbol, {targetChainType, ignoreReservation});
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

    async checkErc721Approved(chain, token, ids, owner, operator) {
        let abi = this.configService.getAbi("erc721");
        let isApprovedForAll = await this.apiClient.callScFunc(chain, token, "isApprovedForAll", [owner, operator], abi);
        return isApprovedForAll;
    }

    async multiCall(chainType, calls) {
        return this.apiClient.multiCall(chainType, calls);
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

    async getCostModelParameters(chainType, options) {
      return this.apiClient.getCostModelParameters(chainType, options);
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

    async getRegisteredSubgraph(options) {
      return this.apiClient.getRegisteredSubgraph(options);
    }

    async getRegisteredTokenIssuer(options) {
      return this.apiClient.getRegisteredTokenIssuer(options);
    }

    async getRegisteredCoinGecko(options) {
      return this.apiClient.getRegisteredCoinGecko(options);
    }

    async hasHackerAccount(address) {
      return this.apiClient.hasHackerAccount(address);
    }

    async getChainQuotaHiddenFlags(chainIds) {
      return this.apiClient.getChainQuotaHiddenFlags(chainIds);
    }

    async parseCctpMessageSent(chainType, address) {
      return this.apiClient.parseCctpMessageSent(chainType, address);
    }
};

module.exports = IWanBCConnector;

