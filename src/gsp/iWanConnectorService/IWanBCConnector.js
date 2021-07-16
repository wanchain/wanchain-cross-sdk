'use strict';

let iWanClient = require('../libs/iWan-js-sdk/apis/apiInstance.js');

class IWanBCConnector {
    constructor(option) {
        this.m_iWanOption = option;

        this.apiClient = null;
        this.m_biWanConnected = false;
    }

    async init(frameworkService) {
        this.m_frameworkService = frameworkService;
        this.m_eventService = frameworkService.getService("EventService");

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
        console.log("oniwanCheckSpeedSuccess ")
        this.apiClient = iwanInstance;
        await this.onConnect();
        await this.closeOtherIwan(iwanInstAry, this.apiClient);
    }

    async oniwanCheckSpeedFail(iwanInstAry) {
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

    async getTokenPairs(chainIds) {
        let ret = await this.apiClient.getTokenPairs(chainIds);
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

    async getTokenInfo(chain, tokenAddr) {
        let ret = await this.apiClient.getTokenInfo(chain, tokenAddr);
        return ret;
    }

    async getTokenBalance(chain, accountAddr, tokenAddr) {
        let ret = await this.apiClient.getTokenBalance(chain, accountAddr, tokenAddr);
        return ret;
    }

    async getErc20Allowance(chain, scAddr, ownerAddr, spenderAddr, scAbi) {
        let ret = await this.apiClient.callScFunc(chain,
            scAddr,
            "allowance",
            [ownerAddr, spenderAddr],
            scAbi);
        return ret;
    }

    async getScEvent(chainType, address, topics, option) {
        let ret = await this.apiClient.getScEvent(chainType, address, topics, option);
        return ret;
    }

    async getStoremanGroupQuota(chainType, groupId, symbol) {
        let ret = await this.apiClient.getStoremanGroupQuota(chainType, groupId, symbol);
        return ret;
    }

    async estimateNetworkFee(chainType, feeType, toChainType) {
        let ret = await this.apiClient.estimateNetworkFee(chainType, feeType, toChainType);
        return ret;
    }

    async getTxInfo(chain, txHash) {
        let ret = await this.apiClient.getTxInfo(chain, txHash);
        return ret;
    }

    async getCrossChainFees(chainType, chainIds) {
        return await this.apiClient.getCrossChainFees(chainType, chainIds);
    }

    async getStoremanGroupConfig(storemanGroupId) {
        return await this.apiClient.getStoremanGroupConfig(storemanGroupId);
    }
};

module.exports = IWanBCConnector;

