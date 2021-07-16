
// memo should like follows
// memo_Type + memo_Data, Divided Symbols should be '0x'
// Type: 1, normal userLock; Data: tokenPairID + toAccount + fee
// Type: 2, normal smg release; Data: tokenPairId + uniqueId/hashX
// Type: 3, abnormal smg transfer for memo_userLock; Data: uniqueId
// Type: 4, abnomral smg transfer for tag_userLock; Data: tag
// Type: 5, smg debt transfer; Data: srcSmg


const TYPE = {
    cross: 1,  //TODO: rename to 'UserLock'
    smg: 2,     //TODO: rename to 'SmgRelease'
    smgDebt: 5,
    Invalid: -1,
}

const MemoTypeLen = 2;
const TokenPairIDLen = 4;
const WanAccountLen = 40; // This should be peer chain( Wan Or Eth) address length. Exclude leadind '0x'


function hexTrip0x(hexs) {
    if (0 == hexs.indexOf('0x')) {
        return hexs.slice(2);
    }
    return hexs;
}


/**
 *
 * Type: 1, normal userLock; Data: tokenPairID + toAccount + fee
 *
 * @param tokenPairID:  int number
 * @param toPeerChainAccount: wan/eth address with or without leading '0x'
 * @param fee
 * @return {string}
 * @private
 */
function buildUserlockMemo( tokenPairID, toPeerChainAccount, fee) {
    let resultMemo = ""
    const log = this.log;

    toPeerChainAccount = hexTrip0x(toPeerChainAccount);

    if(typeof tokenPairID === "number" && toPeerChainAccount.length === WanAccountLen) {

        const typeString = TYPE.cross.toString(16).padStart(MemoTypeLen, 0);
        const tokenPairIdSting =  parseInt(tokenPairID).toString(16).padStart(TokenPairIDLen, 0);

        resultMemo = typeString + tokenPairIdSting + toPeerChainAccount + '' + fee
    }else {
        log.error("buildUserlockMemo() found Invalid parameter.")
    }
    return resultMemo;
}

/**
 *
 * @param tokenPairID: int number
 * @param uniqueId:  hash/hashX/etc that can unique identify one transaction.
 * @return {string}
 */
function buildSmgTypeMemo( tokenPairID, uniqueId) {
    const hex_memo_smg_type = ('0' + TYPE.smg.toString(16)).slice(-2);
    const hex_tokenPairID = parseInt(tokenPairID).toString(16).padStart(TokenPairIDLen, 0);
    return  hex_memo_smg_type + hex_tokenPairID + hexTrip0x(uniqueId);
}



function parseMemo(memoData) {

    let result = {memoType: TYPE.Invalid};

    let memoType = memoData.substring(0, MemoTypeLen);
    memoType = parseInt(memoType);

    let startIndex = MemoTypeLen;

    if (memoType === TYPE.cross) {

        const tokenPairID = parseInt(memoData.substring(startIndex, startIndex + TokenPairIDLen), 16);

        startIndex += TokenPairIDLen;
        const userAccount = memoData.substring(startIndex, startIndex + WanAccountLen); // Address without leading '0x'

        startIndex += WanAccountLen;
        const networkFee = (memoData.length === startIndex) ? 0 : parseInt(memoData.substr(startIndex), 16);

        result = {memoType, tokenPairID, userAccount, networkFee} // TODO：WYH：是否要包含 hashX ？
    }else if(memoType === TYPE.smg) {
        if(memoData.length !== 70) {
            return result
        }
        const tokenPairID = parseInt(memoData.substring(startIndex, startIndex + TokenPairIDLen), 16);

        startIndex += TokenPairIDLen;
        const uniqueId = memoData.substr(startIndex);

        result = {memoType, tokenPairID, hashX: uniqueId}
    }else if(memoType === TYPE.smgDebt){
        if(memoData.length !== 66) {
            return result
        }
        const srcSmg = '0x' + memoData.substr(MemoTypeLen);
        result = {memoType, srcSmg}
    }else{
        // TODO: ...
    }

    return result
}



module.exports = {buildUserlockMemo, buildSmgTypeMemo,  parseMemo, TYPE, }
