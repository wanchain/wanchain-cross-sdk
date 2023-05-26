'use strict';

const BigNumber = require("bignumber.js");
const tool = require("../../utils/tool.js");
const Web3 = require("web3");

const web3 = new Web3();

module.exports = class TxGeneratorService{
    constructor() {
    }

    async init(frameworkService) {
        this.frameworkService = frameworkService;
        this.iwan = frameworkService.getService("iWanConnectorService");
        this.configService = frameworkService.getService("ConfigService");
    }

    // erc20 approve
    // event: Approval(address indexed owner, address indexed spender, uint256 value)
    // topic[0]: 0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925
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
    // event: ApprovalForAll(address indexed account, address indexed operator, bool approved)
    // topic[0]: 0x17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b5937696c31
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
        let rawTx = {
            gasPrice: "0x" + new BigNumber(gasPrice).toString(16),
            gas: "0x" + new BigNumber(new BigNumber(gasLimit).times(1.1).toFixed(0)).toString(16),
            to: toAddress.toLowerCase(),
            value: "0x" + new BigNumber(value || 0).toString(16),
            data,
            from: from.toLowerCase()
            // chainId
        };
        console.debug("%s generateTx gasPrice: %s, gasLimit: %s", chainType, gasPrice, Number(rawTx.gas).toFixed());
        // console.debug("generateTx: %O", rawTx);
        return rawTx;
    }

    // erc20 event: UserLockLogger(bytes32 indexed smgID, uint256 indexed tokenPairID, address indexed tokenAccount, uint256 value, uint256 contractFee, bytes userAccount);
    // erc20 topic[0]: 0x43eb196c5950c738b34cd1760941e0876559e4fb835498fe19016bc039ad61a9
    // nft event: UserLockNFT(bytes32 indexed smgID, uint indexed tokenPairID, address indexed tokenAccount, string[] keys, bytes[] values)
    // nft topic[0]: 0x62605e96f2f9cd2d124a846c58ea7d9982610ba45d052c99b14900c37a718683
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
        if ((extInfo.chainType === "WAN") && (gasLimit < 200000)) {
          gasLimit = 200000;
        }
        console.debug("%s generateUserLockData gasLimit: %s", extInfo.chainType, gasLimit);
        return {data, gasLimit};
    }

    // erc20 event: UserBurnLogger(bytes32 indexed smgID, uint indexed tokenPairID, address indexed tokenAccount, uint value, uint contractFee, uint fee, bytes userAccount)
    // erc20 topic[0]: 0xe314e23175856b9484e39ab0547753cf1b5cd0cbe3b0d7018c953d31f23fc767
    // nft event: UserBurnNFT(bytes32 indexed smgID, uint indexed tokenPairID, address indexed tokenAccount, string[] keys, bytes[] values)
    // nft topic[0]: 0x988781dff960cf5a144a15c9b0c4d1346196e415e64ea7ebd609c6ac0559bbbb
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
      if ((extInfo.chainType === "WAN") && (gasLimit < 200000)) {
        gasLimit = 200000;
      }
      console.debug("%s generateUserBurnData gasLimit: %s", extInfo.chainType, gasLimit);
      return {data, gasLimit};
    }

    // event: DepositForBurnWithFee(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, uint256 fee)
    // topic[0]: 0x6dce5b2406630dbc3a2633f31a15505733a9ede5169532aaab88ac01c77ff1e4
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