
// memo should like follows
// memo_Type + memo_Data, Divided Symbols should be '0x'
// Type: 1, normal userLock; Data: tokenPairID + toAccount + fee
// Type: 2, normal smg release; Data: tokenPairId + uniqueId/hashX
// Type: 3, abnormal smg transfer for memo_userLock; Data: uniqueId
// Type: 4, abnomral smg transfer for tag_userLock; Data: tag
// Type: 5, smg debt transfer; Data: srcSmg

const TX_TYPE = {
    UserLock:   1,
    SmgRelease: 2,
    smgDebt:    5,
    Invalid:    -1
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
 * Type: 1, normal userLock; Data: tokenPairID + toAccount + fee
 *
 * @param tokenPairID:  int number
 * @param toPeerChainAccount: wan/eth address with or without leading '0x'
 * @param fee
 * @return {string}
 * @private
 */
function buildUserlockMemo(tokenPairID, toPeerChainAccount, fee) {
  let memo = "";
  toPeerChainAccount = hexTrip0x(toPeerChainAccount);
  if ((typeof tokenPairID === "number") && (toPeerChainAccount.length === WanAccountLen)) {
    let typeString = TX_TYPE.UserLock.toString(16).padStart(MemoTypeLen, 0);
    let tokenPairIdSting = parseInt(tokenPairID).toString(16).padStart(TokenPairIDLen, 0);
    memo = typeString + tokenPairIdSting + toPeerChainAccount + '' + fee;
  } else {
    console.error("buildUserlockMemo parameter invalid");
  }
  return memo;
}

module.exports = {
    buildUserlockMemo
}