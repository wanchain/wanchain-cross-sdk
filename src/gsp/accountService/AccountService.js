'use strict';


module.exports = class AccountService {
    constructor() {
    }

    async init(frameWorkService) {
        this.m_frameWorkService = frameWorkService;
        this.m_eventService = frameWorkService.getService("EventService");
        this.m_metaMaskService = frameWorkService.getService("MetaMaskService");
        this.polkadotMaskService = frameWorkService.getService("PolkadotMaskService");
        this.m_WebStores = frameWorkService.getService("WebStores");
        this.chainInfoService = this.m_frameWorkService.getService("ChainInfoService");
        this.m_eventService.addEventListener("MetaMaskAccountChanged", this.onMetaMaskAccountChanged.bind(this));
        this.m_accountStoreName = "accountRecords";
        this.m_eventService.addEventListener("MetaMaskChainChanged", this.onMetaMaskChainChanged.bind(this));
    }

    async onMetaMaskAccountChanged(accounts) {
        return this.connectMetaMask();
    }

    async onMetaMaskChainChanged(params) {
        // { "acounts": accounts, "chainId": chainId }
        console.log("onMetaMaskChainChanged params:", params);
    }

    async connectMetaMask() {
        let chainId = this.m_metaMaskService.getChainId();
        let chainInfo = this.chainInfoService.getChainInfoByMaskChainId(chainId);
        if (chainInfo) {
            let accounts = await this.m_metaMaskService.getAccountAry();
            let account = (accounts.length)? accounts[0] : "";
            console.log("connect MetaMask chain %s account: %s", chainInfo.chainType, account);
            this.m_WebStores[this.m_accountStoreName].setAccountData(chainInfo.chainType, "MetaMask", account);
            await this.m_eventService.emitEvent("AccountChanged", {wallet: "MetaMask", account});
        } else {
            console.log("wallet chainId %s does not match bridge network", chainId);
            throw "Invalid network";
        }
    }

    async connectPolkadot() {
        let accounts = await this.polkadotMaskService.getAccountAry();
        console.log("connect polkadot{.js} accounts: %O", accounts);
        if (accounts.length > 0) {
            for (let i = 0; i < accounts.length; i++) {
                this.m_WebStores[this.m_accountStoreName].setAccountData("DOT", "PolkaDot", accounts[i]);
            }
        } else {
            this.m_WebStores[this.m_accountStoreName].setAccountData("DOT", "PolkaDot", "");
        }
        await this.m_eventService.emitEvent("AccountChanged", {wallet: "polkadot{.js}", accounts});
    }

    getChainId(chainType) {
        if (chainType === "DOT") {
            return this.polkadotMaskService.getChainId();
        } else {
            // WAN/ETH/BNB/AVAX/DEV/MATIC
            return this.m_metaMaskService.getChainId();
        }
    }
};

