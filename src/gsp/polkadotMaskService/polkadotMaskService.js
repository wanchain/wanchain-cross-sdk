'use strict';

const { ApiPromise, WsProvider, Keyring } = require('@polkadot/api');

const {
    web3Accounts,
    web3Enable,
    web3FromAddress,
    web3ListRpcProviders,
    web3UseRpcProvider
} = require('@polkadot/extension-dapp');

const { buildUserlockMemo, buildSmgTypeMemo, parseMemo, TYPE } = require("./memoProtocol");
let BigNumber = require("bignumber.js");

const _util = require("@polkadot/util");
const _utilCrypto = require("@polkadot/util-crypto");

module.exports = class PolkadotMaskService {
    constructor() {
        this.m_walletType = "PolkadotMask";
    }

    async init(frameworkService) {
        try {
            console.log("polkadotMaskService init");
            this.m_frameworkService = frameworkService;
        }
        catch (err) {
            console.log("PolkadotMaskService init err:", err);
        }
    }

    async getApi() {
        if (!this.m_api) {
            let chainInfoService = this.m_frameworkService.getService("ChainInfoService");
            let chainInfo = await chainInfoService.getChainInfoByType("DOT");
            const provider = new WsProvider(chainInfo.RpcUrl);
            const api = await ApiPromise.create({ provider: provider });
            this.m_api = await api.isReady;
        }
        return this.m_api;
    }

    async sendTransaction(senderAddr, txs) {
        let api = await this.getApi();
        const fromInjector = await web3FromAddress(senderAddr);

        const blockInfo = await api.rpc.chain.getBlock();
        const blockNumber = blockInfo.block.header.number;
        const blockHash = await api.rpc.chain.getBlockHash(blockNumber.unwrap());
        let options = {};
        options.signer = fromInjector.signer;
        options.blockHash = blockHash.toHex();
        options.era = 64;

        const txHash = await api.tx.utility.batch(txs).signAndSend(senderAddr, options);

        //console.log("sendTransaction txHash:", txHash);
        //console.log("sendTransaction txHash.toHex():", txHash.toHex());
        return txHash.toHex();



    //    let uiStrService = this.m_frameworkService.getService("UIStrService");
    //    let strFailed = uiStrService.getStrByName("Failed");
    //    let strSucceeded = uiStrService.getStrByName("Succeeded");
    //    let strRejected = uiStrService.getStrByName("Rejected");

    //    try {
    //        const txHash = await wanchain.request({
    //            method: 'eth_sendTransaction',
    //            params: [TxObj]
    //        });
    //        return { "result": true, "txhash": txHash, "desc": strSucceeded };
    //    }
    //    catch (err) {
    //        if (err.code === 4001) {
    //            // refused
    //            return { "result": false, "txhash": err.message, "desc": strRejected };
    //        }
    //        else {
    //            return { "result": false, "txhash": err.message, "desc": strFailed };
    //        }
    //    }
    }

    async getAccountAry() {
        try {
            const allInjected = await web3Enable('wanBridge');
            if (allInjected.length === 0) {
                console.log("polkadot{.js} no installed!");
                return [];
            }

            const allAccounts = await web3Accounts();
            let retAry = [];
            for (let idx = 0; idx < allAccounts.length; ++idx) {
                retAry.push(allAccounts[idx].address);
            }
            return retAry;
        }
        catch (err) {
            console.log("DOT getAccountAry err:", err);
            return [];
        }
    }

    async getBalance(addr) {
        let api = await this.getApi();

        const now = await api.query.timestamp.now();
        const { nonce, data: balance } = await api.query.system.account(addr);
        //console.log(`Now: ${now}: balance of ${balance.free} and a nonce of ${nonce}`);

        // await this.transferCoin(addr, "5GNybLmWcxgFC3WLwM9JtiARoYTgXvXpB6P2yMjkH7KQ1f6K");

        return balance.free;
    }

    getChainId() {
        return 0;
    }

    async transferCoin(fromAddr, toAddr) {
        try {
            console.log("transferCoin fromAddr:", fromAddr);
            console.log("transferCoin toAddr:", toAddr);
            let api = await this.getApi();
            const now = await api.query.timestamp.now();
            const { nonce, data: balance } = await api.query.system.account(fromAddr);
            console.log(`Now: ${now}: balance of ${balance.free} and a nonce of ${nonce}`);

            const fromInjector = await web3FromAddress(fromAddr);

            const transfer = api.tx.balances.transfer(toAddr, 1000000000001);
            const txHash = await transfer.signAndSend(fromAddr, { signer: fromInjector.signer });
            console.log("txHash:", txHash);

        }
        catch (err) {
            console.log("DOT transferCoin err:", err);
            return;
        }
    }

    async buildUserLockMemo(tokenPairID, toPeerChainAccount, fee) {
        return buildUserlockMemo(tokenPairID, toPeerChainAccount, fee);
    }

    async estimateFee(sendAddr, txs) {
        let api = await this.getApi();
        const fromInjector = await web3FromAddress(sendAddr);
        const info = await api.tx.utility.batch(txs).paymentInfo(sendAddr, { signer: fromInjector.signer });
        let fee = new BigNumber(info.partialFee.toHex());
        return fee;
    }

    async longPubKeyToAddress(longPubKey, ss58Format = 42) {
        longPubKey = '0x04' + longPubKey.slice(2);
        const tmp = _util.hexToU8a(longPubKey);
        const pubKeyCompress = _utilCrypto.secp256k1Compress(tmp);
        const hash = _utilCrypto.blake2AsU8a(pubKeyCompress);
        const keyring = new Keyring({ type: 'ecdsa', ss58Format: ss58Format });
        const address = keyring.encodeAddress(hash);
        return address;
    }
};

