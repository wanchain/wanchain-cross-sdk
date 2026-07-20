import BigNumber from "bignumber.js";
import { Transaction } from "@mysten/sui/transactions";

function validateAddress(address) {
  return /^0x[0-9a-f]{64}$/.test(address);
}

function getStandardAddressInfo(address) {
  return { native: address, evm: address, text: address, cctp: address, compact: address };
}

function newTransaction() {
  return new Transaction();
}

function selectCoins(coins, amount) {
  let selected = [], sumAmount = new BigNumber(0);
  for (let coin of coins) {
    if (coin.balance > 0) { // maybe is "0"
      selected.push(coin);
      sumAmount = sumAmount.plus(coin.balance);
      if (sumAmount.gte(amount)) {
        return selected;
      }
    }
  }
  return [];
}

const CctpMsgMapping = [
  ["version", 8],
  ["sourceDomain", 8],
  ["destinationDomain", 8],
  ["nonce", 16],
  ["sender", 64],
  ["recipient", 64],
  ["destinationCaller", 64],
  ["version2", 8],
  ["burnToken", 64],
  ["mintRecipient", 64],
  ["amount", 64],
  ["messageSender", 64]
];

function parseCctpDepositMessage(message) {
  try {
    let hex = Buffer.from(message, 'base64').toString('hex');
    let begin = 0, msg = {};
    for (let i = 0; i < CctpMsgMapping.length; i++) {
      let end = begin + CctpMsgMapping[i][1];
      msg[CctpMsgMapping[i][0]] = hex.slice(begin, end);
      begin = end;
    }
    let result = {
      version: parseInt(msg.version, 16),
      sourceDomain: parseInt(msg.sourceDomain, 16),
      destinationDomain: parseInt(msg.destinationDomain, 16),
      nonce: new BigNumber(msg.nonce, 16).toFixed(),
      sender: '0x' + msg.sender,
      recipient: '0x' + msg.recipient,
      destinationCaller: '0x' + msg.destinationCaller,
      version2: parseInt(msg.version2, 16),
      burnToken: '0x' + msg.burnToken,
      mintRecipient: '0x' + msg.mintRecipient,
      amount: new BigNumber(msg.amount, 16).toFixed(),
      messageSender: '0x' + msg.messageSender,
    };
    return result;
  } catch (err) {
    console.error("SUI parseCctpDepositMessage error: %O", err);
    return null;
  }
}

const tools = {
  validateAddress,
  getStandardAddressInfo,
  newTransaction,
  selectCoins,
  parseCctpDepositMessage
};

export default tools;
