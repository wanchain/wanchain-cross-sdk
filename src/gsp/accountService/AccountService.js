'use strict';


module.exports = class AccountService {
    constructor() {
    }

    async init(frameWorkService) {
        this.m_frameWorkService = frameWorkService;
        this.m_eventService = frameWorkService.getService("EventService");
        this.m_metaMaskService = frameWorkService.getService("MetaMaskService");
        this.m_WebStores = frameWorkService.getService("WebStores");
        this.chainInfoService = this.m_frameWorkService.getService("ChainInfoService");
        this.m_eventService.addEventListener("MetaMaskAccountChanged", this.connectMask.bind(this));
        this.m_accountStoreName = "accountRecords";
        this.m_eventService.addEventListener("MetaMaskChainChanged", this.onMetaMaskChainChanged.bind(this));
    }

    async connectMask(accounts) {
        try {
            let chainId = await this.m_metaMaskService.getChainId();
            let chainInfo = await this.chainInfoService.getChainInfoByMaskChainId(chainId);
            if (chainInfo) {
                let accounts = await this.m_metaMaskService.getAccountAry();
                let account = (accounts.length)? accounts[0] : "";
                console.log("connectMask chain %s accounts: ", chainInfo.chainType, account);
                this.m_WebStores[this.m_accountStoreName].setAccountData(chainInfo.chainType, "MetaMask", account);
                await this.m_eventService.emitEvent("AccountChanged", {wallet: "MetaMask", account});
                return account;
            } else {
                console.log("wallet chainId %s does not match bridge network", chainId);
                return "";
            }
        } catch (err) {
            console.log("connectMask err:", err);
            return "";
        }
    }

    async onMetaMaskChainChanged(params) {
        // { "acounts": accounts, "chainId": chainId }
        console.log("onMetaMaskChainChanged params:", params);
    }

    getChainId() {
        return this.m_metaMaskService.getChainId();
    }
};

