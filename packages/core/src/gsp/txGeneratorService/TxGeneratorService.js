'use strict';
const Web3 = require("web3");
const web3 = new Web3();

const BigNumber = require("bignumber.js");
const tool = require("../../utils/tool.js");

module.exports = class TxGeneratorService{
    constructor() {
    }

    async init(frameworkService) {
        this.frameworkService = frameworkService;
        this.iwan = frameworkService.getService("iWanConnectorService");
        this.configService = frameworkService.getService("ConfigService");
    }

    // erc20 approve
    async generatorErc20ApproveData(tokenAddress, spenderAddress, value, options = {}) {
        value = "0x" + new BigNumber(value).toString(16);
        let abi = this.configService.getAbi("erc20");
        tokenAddress = tokenAddress.toLowerCase();
        let erc20Inst = new web3.eth.Contract(abi, tokenAddress);
        let data = erc20Inst.methods.approve(spenderAddress.toLowerCase(), value).encodeABI();
        let gasLimit = await this.iwan.estimateGas(options.chainType, {from: options.from.toLowerCase(), to: tokenAddress, value: '0x00', data});
        console.debug("%s generatorErc20ApproveData gasLimit: %s", options.chainType, gasLimit);
        return {data, gasLimit};
    }

    // nft approve: erc721 & erc1155
    async generatorErc721ApproveData(tokenAddress, operator, options = {}) {
        let abi = this.configService.getAbi("erc721");
        tokenAddress = tokenAddress.toLowerCase();
        let sc = new web3.eth.Contract(abi, tokenAddress.toLowerCase());
        let data = sc.methods.setApprovalForAll(operator.toLowerCase(), true).encodeABI();
        let gasLimit = await this.iwan.estimateGas(options.chainType, {from: options.from.toLowerCase(), to: tokenAddress, value: '0x00', data});
        console.debug("%s generatorErc721ApproveData gasLimit: %s", options.chainType, gasLimit);
        return {data, gasLimit};
    }

    async generateTx(chainType, gasLimit, toAddress, value, data, from) {
        let gasPrice = await this.iwan.getGasPrice(chainType);
        console.debug("%s generateTx gasPrice: %s", chainType, gasPrice);
        let rawTx = {
            gasPrice: "0x" + new BigNumber(gasPrice).toString(16),
            gas: "0x" + new BigNumber(new BigNumber(gasLimit).times(1.1).toFixed(0)).toString(16),
            to: toAddress.toLowerCase(),
            value: "0x" + new BigNumber(value || 0).toString(16),
            data,
            from: from.toLowerCase()
            // chainId
        };
        // console.debug("generateTx: %O", rawTx);
        return rawTx;
    }

    async generateUserLockData(crossScAddr, smgID, tokenPairID, value, userAccount, extInfo = {}) {
        let abi = this.configService.getAbi("crossSc");
        let scAddr = crossScAddr.toLowerCase();
        let crossScInst = new web3.eth.Contract(abi, scAddr);
        let data, tokenType = extInfo.tokenType;
        if (tokenType === "Erc20") {
          value = "0x" + new BigNumber(value).toString(16);
          data = crossScInst.methods.userLock(smgID, tokenPairID, value, userAccount).encodeABI();
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
          data = crossScInst.methods.userLockNFT(smgID, tokenPairID, tokenIDs, tokenValues, userAccount).encodeABI();
        }
        let txValue = "0x" + new BigNumber(extInfo.coinValue || 0).toString(16);
        let gasLimit = await this.iwan.estimateGas(extInfo.chainType, {from: extInfo.from.toLowerCase(), to: scAddr, value: txValue, data});
        console.debug("%s generateUserLockData gasLimit: %s", extInfo.chainType, gasLimit);
        return {data, gasLimit};
    }

    async generateUserBurnData(crossScAddr, smgID, tokenPairID, value, fee, tokenAccount, userAccount, extInfo = {}) {
      let abi = this.configService.getAbi("crossSc");
      let scAddr = crossScAddr.toLowerCase();
      let crossScInst = new web3.eth.Contract(abi, scAddr);
      let data, tokenType = extInfo.tokenType;
      if (tokenType === "Erc20") {
        value = "0x" + new BigNumber(value).toString(16);
        fee = "0x" + new BigNumber(fee).toString(16);
        data = crossScInst.methods.userBurn(smgID, tokenPairID, value, fee, tokenAccount, userAccount).encodeABI();
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
        data = crossScInst.methods.userBurnNFT(smgID, tokenPairID, tokenIDs, tokenValues, tokenAccount, userAccount).encodeABI();
      }
      let txValue = "0x" + new BigNumber(extInfo.coinValue || 0).toString(16);
      let gasLimit = await this.iwan.estimateGas(extInfo.chainType, {from: extInfo.from.toLowerCase(), to: scAddr, value: txValue, data});
      console.debug("%s generateUserBurnData gasLimit: %s", extInfo.chainType, gasLimit);
      return {data, gasLimit};
    }

    async generateCircleBridgeDeposit(crossScAddr, destDomain, value, tokenAccount, userAccount, options) {
      let abi = this.configService.getAbi("circleBridgeProxy");
      let scAddr = crossScAddr.toLowerCase();
      let crossScInst = new web3.eth.Contract(abi, scAddr);
      value = "0x" + new BigNumber(value).toString(16);
      let destInBytes32 = '0x' + tool.hexStrip0x(userAccount).toLowerCase().padStart(64, '0');
      let data = crossScInst.methods.depositForBurn(value, destDomain, destInBytes32, tokenAccount).encodeABI();
      let txValue = "0x" + new BigNumber(options.coinValue || 0).toString(16);
      let gasLimit = await this.iwan.estimateGas(options.chainType, {from: options.from.toLowerCase(), to: scAddr, value: txValue, data});
      console.debug("%s generateCircleBridgeDeposit gasLimit: %s", options.chainType, gasLimit);
      return {data, gasLimit};
    }
}