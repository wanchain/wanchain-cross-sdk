import processErc20UserFastMint from "./ProcessErc20UserFastMint.js";
import processErc20Approve from "./ProcessErc20Approve.js";
import processErc20UserFastBurn from "./ProcessErc20UserFastBurn.js";
import processCoinUserFastMint from "./ProcessCoinUserFastMint.js";
import processMintBtcFromBitcoin from "./ProcessMintBtcFromBitcoin.js";
import processMintFromBitcoinWallet from "./ProcessMintFromBitcoinWallet.js";
import processXrpMintFromRipple from "./ProcessXrpMintFromRipple.js";
import processDotMintFromPolka from "./ProcessDotMintFromPolka.js";
import processBurnErc20ProxyToken from "./ProcessBurnErc20ProxyToken.js";
import processErc721Approve from "./ProcessErc721Approve.js";
import processMintFromCardano from "./ProcessMintFromCardano.js";
import processBurnFromCardano from "./ProcessBurnFromCardano.js";
import processPhaMintFromPhala from "./ProcessPhaMintFromPhala.js";
import processCircleBridgeDeposit from "./ProcessCircleBridgeDeposit.js";
import processMintFromCosmos from "./ProcessMintFromCosmos.js";
import processCircleBridgeNobleDeposit from "./ProcessCircleBridgeNobleDeposit.js";
import processCircleBridgeSolanaDeposit from "./ProcessCircleBridgeSolanaDeposit.js";
import processCircleBridgeSolanaReclaim from "./ProcessCircleBridgeSolanaReclaim.js";
import processMintFromAlgorand from "./ProcessMintFromAlgorand.js";
import processMintFromSolana from "./ProcessMintFromSolana.js";
import processBurnFromSolana from "./ProcessBurnFromSolana.js";
import processCircleBridgeSuiDeposit from "./ProcessCircleBridgeSuiDeposit.js";
import processErc20ApproveSync from "./ProcessErc20ApproveSync.js";
import processClaimRewardTask from "./ProcessClaimRewardTask.js";
import processClaimCrossReward from "./ProcessClaimCrossReward.js";
import processMintFromSui from "./ProcessMintFromSui.js";
import processBurnFromSui from "./ProcessBurnFromSui.js";
import processMintFromTon from "./ProcessMintFromTon.js";
import processMidnightRechargeFee from "./ProcessMidnightRechargeFee.js";
import processBurnFromMidnight from "./ProcessBurnFromMidnight.js";
import processMidnightClaim from "./ProcessMidnightClaim.js";
;
export default [
  {
    "name": "ProcessErc20UserFastMint",
    "handle": processErc20UserFastMint
  },
  {
    "name": "ProcessErc20Approve",
    "handle": processErc20Approve
  },
  {
    "name": "ProcessErc20UserFastBurn",
    "handle": processErc20UserFastBurn
  },
  {
    "name": "ProcessCoinUserFastMint",
    "handle": processCoinUserFastMint
  },
  {
    "name": "ProcessMintBtcFromBitcoin",
    "handle": processMintBtcFromBitcoin
  },
  {
    "name": "ProcessMintFromBitcoinWallet",
    "handle": processMintFromBitcoinWallet
  },
  {
    "name": "ProcessXrpMintFromRipple",
    "handle": processXrpMintFromRipple
  },
  {
    "name": "ProcessDotMintFromPolka",
    "handle": processDotMintFromPolka
  },
  {
    "name": "ProcessBurnErc20ProxyToken",
    "handle": processBurnErc20ProxyToken
  },
  {
    "name": "ProcessErc721Approve",
    "handle": processErc721Approve
  },
  {
    "name": "ProcessMintFromCardano",
    "handle": processMintFromCardano
  },
  {
    "name": "ProcessBurnFromCardano",
    "handle": processBurnFromCardano
  },
  {
    "name": "ProcessPhaMintFromPhala",
    "handle": processPhaMintFromPhala
  },
  {
    "name": "ProcessCircleBridgeDeposit",
    "handle": processCircleBridgeDeposit
  },
  {
    "name": "ProcessMintFromCosmos",
    "handle": processMintFromCosmos
  },
  {
    "name": "ProcessCircleBridgeNobleDeposit",
    "handle": processCircleBridgeNobleDeposit
  },
  {
    "name": "ProcessCircleBridgeSolanaDeposit",
    "handle": processCircleBridgeSolanaDeposit
  },
  {
    "name": "ProcessCircleBridgeSolanaReclaim",
    "handle": processCircleBridgeSolanaReclaim
  },
  {
    "name": "ProcessMintFromAlgorand",
    "handle": processMintFromAlgorand
  },
  {
    "name": "ProcessMintFromSolana",
    "handle": processMintFromSolana
  },
  {
    "name": "ProcessBurnFromSolana",
    "handle": processBurnFromSolana
  },
  {
    "name": "ProcessCircleBridgeSuiDeposit",
    "handle": processCircleBridgeSuiDeposit
  },
  {
    "name": "ProcessErc20ApproveSync",
    "handle": processErc20ApproveSync
  },
  {
    "name": "ProcessClaimRewardTask",
    "handle": processClaimRewardTask
  },
  {
    "name": "ProcessClaimCrossReward",
    "handle": processClaimCrossReward
  },
  {
    "name": "ProcessMintFromSui",
    "handle": processMintFromSui
  },
  {
    "name": "ProcessBurnFromSui",
    "handle": processBurnFromSui
  },
  {
    "name": "ProcessMintFromTon",
    "handle": processMintFromTon
  },
  {
    "name": "ProcessMidnightRechargeFee",
    "handle": processMidnightRechargeFee
  },
  {
    "name": "ProcessBurnFromMidnight",
    "handle": processBurnFromMidnight
  },
  {
    "name": "ProcessMidnightClaim",
    "handle": processMidnightClaim
  }
];
