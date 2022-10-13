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
        this.configService = this.m_frameworkService.getService("ConfigService");
    }

    // erc20 approve
    async generatorErc20ApproveData(ecr20Address, spenderAddress, value) {
        try {
            value = "0x" + new BigNumber(value).toString(16);
            let abi = this.configService.getAbi("erc20");
            let erc20Inst = new web3.eth.Contract(abi, ecr20Address.toLowerCase());
            let txData = erc20Inst.methods.approve(spenderAddress.toLowerCase(), value).encodeABI();
            return txData;
        } catch (err) {
            console.log("generatorErc20ApproveData error: %O", err);
        }
    }

    // nft approve: erc721 & erc1155
    async generatorErc721ApproveData(tokenAddress, operator, tokenId) {
        try {
            let abi = this.configService.getAbi("erc721");
            let sc = new web3.eth.Contract(abi, tokenAddress.toLowerCase());
            let txData = sc.methods.setApprovalForAll(operator.toLowerCase(), true).encodeABI();
            return txData;
        } catch (err) {
            console.error("generatorErc721ApproveData error: %O", err);
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

    async generateUserLockData(crossScAddr, smgID, tokenPairID, value, userAccount, extInfo = {}) {
        let abi = this.configService.getAbi("crossSc");
        let crossScInst = new web3.eth.Contract(abi, crossScAddr.toLowerCase());
        let txData, tokenType = extInfo.tokenType;
        if (tokenType === "Erc20") {
          value = "0x" + new BigNumber(value).toString(16);
          txData = crossScInst.methods.userLock(smgID, tokenPairID, value, userAccount).encodeABI();
        } else {
          let tokenIDs = [], tokenValues = [];
          value.forEach(v => {
            if (tokenType === "Erc721") {
              tokenIDs.push("0x" + new BigNumber(v.tokenId).toString(16));
              tokenValues.push("0x1");
            } else if (tokenType === "Erc1155") {
              tokenIDs.push("0x" + new BigNumber(v.tokenId).toString(16));
              tokenValues.push("0x" + new BigNumber(v.amount).toString(16));
            }
          })
          txData = crossScInst.methods.userLockNFT(smgID, tokenPairID, tokenIDs, tokenValues, userAccount).encodeABI();
        }
        return txData;
    }

    async generateUserBurnData(crossScAddr, smgID, tokenPairID, value, fee, tokenAccount, userAccount, extInfo = {}) {
      let abi = this.configService.getAbi("crossSc");
      let crossScInst = new web3.eth.Contract(abi, crossScAddr.toLowerCase());
      let txData, tokenType = extInfo.tokenType;
      if (tokenType === "Erc20") {
        value = "0x" + new BigNumber(value).toString(16);
        fee = "0x" + new BigNumber(fee).toString(16);
        txData = crossScInst.methods.userBurn(smgID, tokenPairID, value, fee, tokenAccount, userAccount).encodeABI();
      } else {
          let tokenIDs = [], tokenValues = [];
          value.forEach(v => {
            if (tokenType === "Erc721") {
              tokenIDs.push("0x" + new BigNumber(v.tokenId).toString(16));
              tokenValues.push("0x1");
            } else if (tokenType === "Erc1155") {
              tokenIDs.push("0x" + new BigNumber(v.tokenId).toString(16));
              tokenValues.push("0x" + new BigNumber(v.amount).toString(16));
            }
          })
          txData = crossScInst.methods.userBurnNFT(smgID, tokenPairID, tokenIDs, tokenValues, tokenAccount, userAccount).encodeABI();
        }
        return txData;
    }
}


