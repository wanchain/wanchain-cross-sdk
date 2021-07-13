'use strict';


module.exports = class MetaMaskService {
    constructor() {
        this.m_walletType = "MetaMask";
    }

    async init(frameworkService) {
        this.m_frameworkService = frameworkService;
        this.m_eventService = frameworkService.getService("EventService");
        if (await this.isInstalled()) {
            window.ethereum.on('accountsChanged', this.accountsChanged.bind(this));
            window.ethereum.on('chainChanged', this.chainChanged.bind(this));
            window.ethereum.on('disconnect', this.disconnect.bind(this));
            window.ethereum.on('connect', this.connect.bind(this));
        }
    }

    async sendTransaction(TxObj) {
        let uiStrService = this.m_frameworkService.getService("UIStrService");
        let strFailed = uiStrService.getStrByName("Failed");
        let strSucceeded = uiStrService.getStrByName("Succeeded");
        let strRejected = uiStrService.getStrByName("Rejected");
        try {
            const txHash = await window.ethereum.request({
                method: 'eth_sendTransaction',
                params: [TxObj]
            });
            return { "result": true, "txhash": txHash, "desc": strSucceeded };
        }
        catch (err) {
            if (err.code === 4001) {
                // refused
                return { "result": false, "txhash": err.message, "desc": strRejected };
            }
            else {
                return { "result": false, "txhash": err.message, "desc": strFailed };
            }
        }
    }

    async isInstalled() {
        try {
            if (typeof window.ethereum === 'undefined') {
                return false;
            }
            else {
                return true;
            }
        }
        catch (err) {
            return false;
        }
    }

    async getAccountAry() {
        try {
            if (typeof window.ethereum === 'undefined') {
                console.log('Looks like you need a Dapp browser to get started.');
                console.log('Consider installing MetaMask!');
                return [];
            }

            if (window.ethereum) {
                let accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
                return accounts;
            }
            return [];
        }
        catch (err) {
            console.log("MetaMaskService getAccountAry err:", err);
            return [];
        }
    }

    async accountsChanged(accounts) {
        try {
            //console.log("accountsChanged accounts:", accounts);
            await this.updateAccounts(accounts);
        }
        catch (err) {
            console.log("accountsChanged err:", err);
        }
    }

    async chainChanged(chainId) {
        //console.log("chainChanged chainId:", chainId);
        let accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        await this.updateAccounts(accounts);
        await this.m_eventService.emitEvent("MetaMaskChainChanged", { "acounts": accounts, "chainId": chainId });
    }

    async disconnect(connectInfo) {
        await this.updateAccounts([]);
    }

    async connect(connectInfo) {
        try {
            //console.log("connect connectInfo:", connectInfo);
            await this.updateAccounts([]);
        }
        catch (err) {
            console.log("metaMask connect err:", err);
        }
    }

    async updateAccounts(accounts) {
        //console.log("updateAccounts accounts:", accounts);
        await this.m_eventService.emitEvent("MetaMaskAccountChanged", accounts);
    }

    getChainId() {
        try {
            if (window.ethereum) {
                return parseInt(window.ethereum.networkVersion);
            }
            return 0;
        }
        catch (err) {
            console.log("MetaMask getChainId err:", err);
            return 0;
        }
    }
};

