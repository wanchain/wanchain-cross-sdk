'use strict';

const wanUtil = require("wanchain-util");
const ethUtil = require("ethereumjs-util");
//const btcAddrValidate = require('bitcoin-address-validation');

let BigNumber = require("bignumber.js");

module.exports = class UtilService {
    constructor() {
    }

    async init(frameworkService) {
        this.m_frameworkService = frameworkService;
    }

    isEthAddress(address) {
        try {
            let validate;
            if (/^0x[0-9a-f]{40}$/.test(address)) {
                validate = true;
            } else if (/^0x[0-9A-F]{40}$/.test(address)) {
                validate = true;
            } else {
                validate = ethUtil.isValidChecksumAddress(address);
            }
            return validate;
        }
        catch (err) {
            console.log("isEthAddress err:", err);
            return false;
        }
    }

    isWanAddress(address) {
        try {
            let validate;
            if (/^0x[0-9a-f]{40}$/.test(address)) {
                validate = true;
            } else if (/^0x[0-9A-F]{40}$/.test(address)) {
                validate = true;
            } else {
                validate = wanUtil.isValidChecksumAddress(address);
                if(false === validate){
                    validate = ethUtil.isValidChecksumAddress(address);
                }
            }
            return validate;
        }
        catch (err) {
            console.log("isWanAddress err:", err);
            return false;
        }
    }

    async isBtcAddress(addr) {
        return true;
        //console.log("btcAddrValidate:", btcAddrValidate);
        //let btcCheckAddr = btcAddrValidate(addr);
        //console.log("btcCheckAddr :", btcCheckAddr);
        //return btcCheckAddr;
    }

    async checkBalanceGasFee(retAry, chainType, fromAddr, fee) {
        try {
            let iwanBCConnector = this.m_frameworkService.getService("iWanConnectorService");
            // checkBalance & gas
            let balance = await iwanBCConnector.getBalance(chainType, fromAddr);
            balance = new BigNumber(balance);
            let gas = new BigNumber(0);

            
            let gasPrice = await iwanBCConnector.getGasPrice(chainType);

            gasPrice = new BigNumber(gasPrice);

            for (let idx = 0; idx < retAry.length; ++idx) {
                let gasLimit = new BigNumber(retAry[idx].params.gasLimit);

                let gasFee = gasLimit.multipliedBy(gasPrice);
                gas = gas.plus(gasFee);


            }
            gas = gas.plus(fee);

            return balance.isGreaterThanOrEqualTo(gas);
        }
        catch (err) {
            console.log("UtilService checkBalanceGasFee err:", err);
            return false;
        }
    }
};
