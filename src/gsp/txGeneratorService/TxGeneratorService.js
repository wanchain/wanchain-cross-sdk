'use strict';
const Web3 = require("web3");
const web3 = new Web3();

const BigNumber = require("bignumber.js");

module.exports = class TxGeneratorService{
    constructor() {
    }

    async init(frameworkService) {
        this.m_frameworkService = frameworkService;
        this.m_iwanBCConnector = frameworkService.getService("iWanConnectorService");
    }

    // erc20 approve
    async generatorErc20ApproveData(ecr20Address, erc20AbiJson, spenderAddress, value) {
        try {
            value = "0x" + new BigNumber(value).toString(16);
            let erc20Inst = new web3.eth.Contract(erc20AbiJson, ecr20Address.toLowerCase());
            let txData = erc20Inst.methods.approve(spenderAddress.toLowerCase(), value).encodeABI();
            return txData;
        }
        catch (err) {
            console.log("generatorErc20ApproveData err:", err);
        }
    }

    async generateTx(chainType, gasPrice, gasLimit, toAddress, value, txData, fromAddr) {
        //console.log("generateTx gasPrice:", gasPrice, ",gasLimit:", gasLimit);
        //let accountService = await this.m_frameworkService.getService("AccountService");
        //let chainId = await accountService.getChainId(chainType);
        //console.log("generateTx chainId:", chainId);
        //chainId = "0x" + Number(chainId).toString(16);
        //console.log("generateTx 2 chainId:", chainId);
        gasPrice = await this.m_iwanBCConnector.getGasPrice(chainType);
        //console.log("generateTx chain:", chainType,
        //    ",gasPrice:", gasPrice,
        //    ",typeof gasPrice:", typeof gasPrice,
        //    ",gasLimit:", gasLimit,
        //    ",typeof gasLimit:", typeof gasLimit);
        //console.log("generateTx value:", value);
        let txGasPrice = "0x" + new BigNumber(gasPrice).toString(16);
        let rawTx = {
            "gasPrice": txGasPrice,
            "gas": "0x" + new BigNumber(gasLimit).toString(16),
            "to": toAddress.toLowerCase(),
            "value": "0x" + new BigNumber(value).toString(16),
            "data": txData,
            "from": fromAddr
            //"chainId": chainId
        };
        //console.log("rawTx:", rawTx);
        return rawTx;
    }

    async generateUserLockData(crossScAddr, crossScAbiJson, smgID, tokenPairID, value, userAccount) {
        value = "0x" + new BigNumber(value).toString(16);
        let crossScInst = new web3.eth.Contract(crossScAbiJson, crossScAddr.toLowerCase());
        let txData = crossScInst.methods.userLock(smgID, tokenPairID, value, userAccount).encodeABI();
        return txData;
    }

    async generateUserBurnData(crossScAddr, crossScAbiJson, smgID, tokenPairID, value, fee, tokenAccount, userAccount) {
        value = "0x" + new BigNumber(value).toString(16);
        fee = "0x" + new BigNumber(fee).toString(16);
        let crossScInst = new web3.eth.Contract(crossScAbiJson, crossScAddr.toLowerCase());
        let txData = crossScInst.methods.userBurn(smgID, tokenPairID, value, fee, tokenAccount, userAccount).encodeABI();
        return txData;
    }
}


