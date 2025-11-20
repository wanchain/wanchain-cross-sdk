import BigNumber from "bignumber.js";
import tool from "../../utils/tool.js";
'use strict';
const TON_COIN_ACCOUNT_STR = 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c';
const CrossOpCode = {
    userLock: 0x40000001,
    userBurn: 0x40000003
};
const DefaultGas = 1_000_000_000;
export default (class ProcessMintFromTon {
    constructor(frameworkService) {
        this.frameworkService = frameworkService;
        this.webStores = this.frameworkService.getService("WebStores");
        this.configService = frameworkService.getService("ConfigService");
        this.tool = this.configService.getExtension("TON").tool;
        this.storemanService = frameworkService.getService("StoremanService");
        this.tokenPairService = frameworkService.getService("TokenPairService");
        this.iwan = frameworkService.getService("iWanConnectorService");
    }
    async process(stepData, wallet) {
        let params = stepData.params;
        try {
            let tokenPair = this.tokenPairService.getTokenPair(params.tokenPairID);
            let direction = (tokenPair.fromChainType === "TON");
            let tokenAccount = direction ? tokenPair.fromAccount : tokenPair.toAccount;
            let isCoin = (tokenAccount === "0x0000000000000000000000000000000000000000");
            let crossValue = isCoin ? new BigNumber(params.value).minus(params.networkFee).toFixed(0) : params.value;
            let totalTon = new BigNumber(params.networkFee).plus(DefaultGas);
            if (isCoin) {
                totalTon = totalTon.plus(crossValue);
            }
            let queryId = await this.tool.getQueryId();
            let userAccountBuf = Buffer.from(tool.hexStrip0x(params.userAccount), 'hex');
            let userAccountBufLen = userAccountBuf.length;
            let jwSender, jwCrossSc;
            if (isCoin) {
                tokenAccount = jwSender = jwCrossSc = TON_COIN_ACCOUNT_STR;
            }
            else {
                tokenAccount = tool.ascii2letter(tokenAccount);
                let [sender, crossSc] = await Promise.all([
                    this.iwan.call("getAssociatedTokenAddress", { chainType: "TON", address: params.fromAddr, tokenScAddr: tokenAccount }),
                    this.iwan.call("getAssociatedTokenAddress", { chainType: "TON", address: params.crossScAddr, tokenScAddr: tokenAccount })
                ]);
                jwSender = sender.address;
                jwCrossSc = crossSc.address;
            }
            let extraCell = this.tool.beginCell()
                .storeAddress(this.tool.parseAddress(tokenAccount))
                .storeAddress(this.tool.parseAddress(jwSender))
                .storeAddress(this.tool.parseAddress(jwCrossSc))
                .endCell();
            let extraCell2 = this.tool.beginCell()
                .storeAddress(this.tool.parseAddress(params.fromAddr))
                .storeUint(params.networkFee, 256)
                .storeBuffer(Buffer.from("wanchain", "ascii"), 8)
                .endCell();
            let body = this.tool.beginCell()
                .storeUint(CrossOpCode.userLock, 32)
                .storeUint(queryId, 64)
                .storeUint(BigInt(params.storemanGroupId), 256)
                .storeUint(params.tokenPairID, 32)
                .storeUint(crossValue, 256)
                .storeUint(userAccountBufLen, 8)
                .storeBuffer(userAccountBuf, userAccountBufLen)
                .storeRef(extraCell)
                .storeRef(extraCell2)
                .endCell();
            let msgTo, msgBody;
            if (isCoin) {
                msgTo = params.crossScAddr;
                msgBody = body;
            }
            else {
                msgTo = jwSender;
                let forwardFee = totalTon.minus(200_000_000); // reserve 0.2 TON for jettonWallet gas
                msgBody = this.tool.beginCell()
                    .storeUint(0xf8a7ea5, 32) // const int op::transfer = 0xf8a7ea5;
                    .storeUint(queryId, 64)
                    .storeCoins(crossValue)
                    .storeAddress(this.tool.parseAddress(params.crossScAddr)) // receive address (token)
                    .storeAddress(this.tool.parseAddress(params.fromAddr))
                    .storeMaybeRef(null)
                    .storeCoins(forwardFee.toFixed(0))
                    .storeMaybeRef(body)
                    .endCell();
            }
            let msg = { address: msgTo, amount: totalTon.toFixed(0), payload: msgBody.toBoc().toString("base64") };
            let msgHash = await wallet.sendTransaction(msg);
            this.webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, msgHash, ""); // only update txHash(msgHash), no result
            let blockNumber = await this.storemanService.getChainBlockNumber(params.toChainType);
            let checker = {
                chain: "TON",
                ccTaskId: params.ccTaskId,
                stepIndex: stepData.stepIndex,
                msgHash,
                userTxHash: "",
                txHash: "",
                txCheckInfo: null, // only check tx receipt, no event
                convertCheckInfo: {
                    ccTaskId: params.ccTaskId,
                    stepIndex: stepData.stepIndex,
                    uniqueID: "", // update when txHash is available
                    chain: params.toChainType,
                    fromBlockNumber: blockNumber,
                    taskType: this.tokenPairService.getTokenEventType(params.tokenPairID, (direction ? "MINT" : "BURN")),
                }
            };
            let checkTxReceiptService = this.frameworkService.getService("CheckTxReceiptService");
            await checkTxReceiptService.add(checker);
        }
        catch (err) {
            if (["Reject request"].includes(err.message)) {
                this.webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Rejected");
            }
            else {
                console.error("ProcessMintFromTon error: %O", err);
                this.webStores["crossChainTaskRecords"].finishTaskStep(params.ccTaskId, stepData.stepIndex, "", "Failed", tool.getErrMsg(err, "Failed to send transaction"));
            }
        }
    }
});
