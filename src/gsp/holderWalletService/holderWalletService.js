'use strict';


module.exports = class HolderWalletService {
    constructor() {
        this.m_walletType = "holderWallet";
        this.m_accountAry = [];
    }

    async init(frameworkService) {
        this.m_eventService = frameworkService.getService("EventService");
        this.m_storageService = frameworkService.getService("StorageService");
        let localData = await this.m_storageService.load("HolderWalletService", "Account");
        console.log("HolderWalletService.Account:", localData);
        if (localData) {
            this.m_accountAry = JSON.parse(localData);
            console.log("this.m_accountAry :", this.m_accountAry);
        }
    }

    async addAccount(address, name, chain) {
        chain = chain.toUpperCase();
        if (!(chain === "ETH" || chain === "WAN")) {
            return;
        }
        address = address.toLowerCase();
        let obj = {
            "address": address,
            "name": name,
            "walletType": this.m_walletType,
            "chainType":chain
        };
        await this.m_accountAry.push(obj);
        await this.m_storageService.save("HolderWalletService", "Account", JSON.stringify(this.m_accountAry));
        await this.m_eventService.emitEvent("HolderWalletService", this.m_accountAry);
    }

    async getAccountAry() {
        return this.m_accountAry;
    }

    async delAccountByAddress(address) {
    }
};

