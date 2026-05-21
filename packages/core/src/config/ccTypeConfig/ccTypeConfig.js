import mintCoinHandle from "./MintCoinHandle.js";
import mintErc20Handle from "./MintErc20Handle.js";
import burnErc20Handle from "./BurnErc20Handle.js";
import mintBtcFromBitcoinHandle from "./MintBtcFromBitcoinHandle.js";
import mintXrpFromRippleHandle from "./MintXrpFromRippleHandle.js";
import mintDotFromPolkaHandle from "./MintDotFromPolkaHandle.js";
import burnErc20ProxyToken from "./BurnErc20ProxyToken.js";
import mintFromCardano from "./MintFromCardano.js";
import burnFromCardano from "./BurnFromCardano.js";
import circleBridgeDeposit from "./CircleBridgeDeposit.js";
import mintFromCosmos from "./MintFromCosmos.js";
import circleBridgeNobleDeposit from "./CircleBridgeNobleDeposit.js";
import circleBridgeSolanaDeposit from "./CircleBridgeSolanaDeposit.js";
import mintFromAlgorand from "./MintFromAlgorand.js";
import mintFromSolana from "./MintFromSolana.js";
import burnFromSolana from "./BurnFromSolana.js";
import circleBridgeSuiDeposit from "./CircleBridgeSuiDeposit.js";
import claimRewardTask from "./ClaimRewardTask.js";
import mintFromSui from "./MintFromSui.js";
import burnFromSui from "./BurnFromSui.js";
import mintFromTon from "./MintFromTon.js";
import mintFromMidnight from "./MintFromMidnight.js";
import burnFromMidnight from "./BurnFromMidnight.js";

export default [
  {
    "name": "MintCoin",
    "handle": mintCoinHandle
  },
  {
    "name": "MintErc20",
    "handle": mintErc20Handle
  },
  {
    "name": "BurnErc20",
    "handle": burnErc20Handle
  },
  {
    "name": "MintBtcFromBitcoinHandle",
    "handle": mintBtcFromBitcoinHandle
  },
  {
    "name": "MintXrpFromRippleHandle",
    "handle": mintXrpFromRippleHandle
  },
  {
    "name": "MintDotFromPolkaHandle",
    "handle": mintDotFromPolkaHandle
  },
  {
    "name": "BurnErc20ProxyToken",
    "handle": burnErc20ProxyToken
  },
  {
    "name": "MintFromCardano",
    "handle": mintFromCardano
  },
  {
    "name": "BurnFromCardano",
    "handle": burnFromCardano
  },
  {
    "name": "CircleBridgeDeposit",
    "handle": circleBridgeDeposit
  },
  {
    "name": "MintFromCosmos",
    "handle": mintFromCosmos
  },
  {
    "name": "CircleBridgeNobleDeposit",
    "handle": circleBridgeNobleDeposit
  },
  {
    "name": "CircleBridgeSolanaDeposit",
    "handle": circleBridgeSolanaDeposit
  },
  {
    "name": "MintFromAlgorand",
    "handle": mintFromAlgorand
  },
  {
    "name": "MintFromSolana",
    "handle": mintFromSolana
  },
  {
    "name": "BurnFromSolana",
    "handle": burnFromSolana
  },
  {
    "name": "CircleBridgeSuiDeposit",
    "handle": circleBridgeSuiDeposit
  },
  {
    "name": "ClaimRewardTask",
    "handle": claimRewardTask
  },
  {
    "name": "MintFromSui",
    "handle": mintFromSui
  },
  {
    "name": "BurnFromSui",
    "handle": burnFromSui
  },
  {
    "name": "MintFromTon",
    "handle": mintFromTon
  },
  {
    "name": "MintFromMidnight",
    "handle": mintFromMidnight
  },
  {
    "name": "BurnFromMidnight",
    "handle": burnFromMidnight
  },
];
