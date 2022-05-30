'use strict';

const BigNumber = require("bignumber.js");
const { ApiPromise, WsProvider, Keyring } = require('@polkadot/api');
const { web3FromAddress } = require('@polkadot/extension-dapp');
const util = require("@polkadot/util");
const utilCrypto = require("@polkadot/util-crypto");

module.exports = class PolkadotService {
    constructor() {
        this.api = null;
    }

    async init(frameworkService) {
        let chainInfoService = frameworkService.getService("ChainInfoService");
        let chainInfo = await chainInfoService.getChainInfoByType("DOT");
        let provider = new WsProvider(chainInfo.RpcUrl);
        this.api = new ApiPromise({provider});
    }

    async getApi() {
        return this.api.isReady;
    }

    async getBalance(addr) {
        await this.getApi();
        let { data: balance } = await this.api.query.system.account(addr);
        return balance.free;
    }

    async longPubKeyToAddress(longPubKey, ss58Format = 42) {
        longPubKey = '0x04' + longPubKey.slice(2);
        const tmp = util.hexToU8a(longPubKey);
        const pubKeyCompress = utilCrypto.secp256k1Compress(tmp);
        const hash = utilCrypto.blake2AsU8a(pubKeyCompress);
        const keyring = new Keyring({type: 'ecdsa', ss58Format: ss58Format});
        const address = keyring.encodeAddress(hash);
        return address;
    }

    async estimateFee(sender, txs) {
        await this.getApi();
        const fromInjector = await web3FromAddress(sender);
        const info = await this.api.tx.utility.batch(txs).paymentInfo(sender, {signer: fromInjector.signer});
        let fee = new BigNumber(info.partialFee.toHex());
        return fee;
    }     
};

