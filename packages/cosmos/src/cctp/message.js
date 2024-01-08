const protobuf = require('protobufjs');

const source = `
  syntax = "proto3";

  package circle.cctp.v1;

  import "gogoproto/gogo.proto";

  option go_package = "github.com/circlefin/noble-cctp-private-builds/x/cctp/types";

  // Msg defines the Msg service.
  service Msg {
    rpc AcceptOwner(MsgAcceptOwner) returns (MsgAcceptOwnerResponse);
    rpc AddRemoteTokenMessenger(MsgAddRemoteTokenMessenger)
        returns (MsgAddRemoteTokenMessengerResponse);
    rpc DepositForBurn(MsgDepositForBurn) returns (MsgDepositForBurnResponse);
    rpc DepositForBurnWithCaller(MsgDepositForBurnWithCaller)
        returns (MsgDepositForBurnWithCallerResponse);
    rpc DisableAttester(MsgDisableAttester) returns (MsgDisableAttesterResponse);
    rpc EnableAttester(MsgEnableAttester) returns (MsgEnableAttesterResponse);
    rpc LinkTokenPair(MsgLinkTokenPair) returns (MsgLinkTokenPairResponse);
    rpc PauseBurningAndMinting(MsgPauseBurningAndMinting)
        returns (MsgPauseBurningAndMintingResponse);
    rpc PauseSendingAndReceivingMessages(MsgPauseSendingAndReceivingMessages)
        returns (MsgPauseSendingAndReceivingMessagesResponse);
    rpc ReceiveMessage(MsgReceiveMessage) returns (MsgReceiveMessageResponse);
    rpc RemoveRemoteTokenMessenger(MsgRemoveRemoteTokenMessenger)
        returns (MsgRemoveRemoteTokenMessengerResponse);
    rpc ReplaceDepositForBurn(MsgReplaceDepositForBurn)
        returns (MsgReplaceDepositForBurnResponse);
    rpc ReplaceMessage(MsgReplaceMessage) returns (MsgReplaceMessageResponse);
    rpc SendMessage(MsgSendMessage) returns (MsgSendMessageResponse);
    rpc SendMessageWithCaller(MsgSendMessageWithCaller)
        returns (MsgSendMessageWithCallerResponse);
    rpc UnlinkTokenPair(MsgUnlinkTokenPair) returns (MsgUnlinkTokenPairResponse);
    rpc UnpauseBurningAndMinting(MsgUnpauseBurningAndMinting)
        returns (MsgUnpauseBurningAndMintingResponse);
    rpc UnpauseSendingAndReceivingMessages(MsgUnpauseSendingAndReceivingMessages)
        returns (MsgUnpauseSendingAndReceivingMessagesResponse);
    rpc UpdateOwner(MsgUpdateOwner) returns (MsgUpdateOwnerResponse);
    rpc UpdateAttesterManager(MsgUpdateAttesterManager)
        returns (MsgUpdateAttesterManagerResponse);
    rpc UpdateTokenController(MsgUpdateTokenController)
        returns (MsgUpdateTokenControllerResponse);
    rpc UpdatePauser(MsgUpdatePauser) returns (MsgUpdatePauserResponse);
    rpc UpdateMaxMessageBodySize(MsgUpdateMaxMessageBodySize)
        returns (MsgUpdateMaxMessageBodySizeResponse);
    rpc SetMaxBurnAmountPerMessage(MsgSetMaxBurnAmountPerMessage) returns (MsgSetMaxBurnAmountPerMessageResponse);
    rpc UpdateSignatureThreshold(MsgUpdateSignatureThreshold)
        returns (MsgUpdateSignatureThresholdResponse);
  }

  // TODO add comments
  message MsgUpdateOwner {
    string from = 1;
    string new_owner = 2;
  }

  message MsgUpdateOwnerResponse {}

  message MsgUpdateAttesterManager {
    string from = 1;
    string new_attester_manager = 2;
  }

  message MsgUpdateAttesterManagerResponse {}

  message MsgUpdateTokenController {
    string from = 1;
    string new_token_controller = 2;
  }

  message MsgUpdateTokenControllerResponse {}

  message MsgUpdatePauser {
    string from = 1;
    string new_pauser = 2;
  }

  message MsgUpdatePauserResponse {}

  message MsgAcceptOwner { string from = 1; }

  message MsgAcceptOwnerResponse {}

  message MsgEnableAttester {
    string from = 1;
    string attester = 2;
  }

  message MsgEnableAttesterResponse {}

  message MsgDisableAttester {
    string from = 1;
    string attester = 2;
  }

  message MsgDisableAttesterResponse {}

  message MsgPauseBurningAndMinting { string from = 1; }

  message MsgPauseBurningAndMintingResponse {}

  message MsgUnpauseBurningAndMinting { string from = 1; }

  message MsgUnpauseBurningAndMintingResponse {}

  message MsgPauseSendingAndReceivingMessages { string from = 1; }

  message MsgPauseSendingAndReceivingMessagesResponse {}

  message MsgUnpauseSendingAndReceivingMessages { string from = 1; }

  message MsgUnpauseSendingAndReceivingMessagesResponse {}

  message MsgUpdateMaxMessageBodySize {
    string from = 1;
    uint64 message_size = 2;
  }

  message MsgUpdateMaxMessageBodySizeResponse {}

  message MsgSetMaxBurnAmountPerMessage {
    string from = 1;
    string local_token = 2;
    string amount = 3 [
      (gogoproto.customtype) = "cosmossdk.io/math.Int",
      (gogoproto.nullable) = false
    ];
  }

  message MsgSetMaxBurnAmountPerMessageResponse {}

  message MsgDepositForBurn {
    string from = 1;
    string amount = 2 [
      (gogoproto.customtype) = "cosmossdk.io/math.Int",
      (gogoproto.nullable) = false
    ];
    uint32 destination_domain = 3;
    bytes mint_recipient = 4;
    string burn_token = 5;
  }

  message MsgDepositForBurnResponse { uint64 nonce = 1; }

  message MsgDepositForBurnWithCaller {
    string from = 1;
    string amount = 2 [
      (gogoproto.customtype) = "cosmossdk.io/math.Int",
      (gogoproto.nullable) = false
    ];
    uint32 destination_domain = 3;
    bytes mint_recipient = 4;
    string burn_token = 5;
    bytes destination_caller = 6;
  }

  message MsgDepositForBurnWithCallerResponse { uint64 nonce = 1; }

  message MsgReplaceDepositForBurn {
    string from = 1;
    bytes original_message = 2;
    bytes original_attestation = 3;
    bytes new_destination_caller = 4;
    bytes new_mint_recipient = 5;
  }

  message MsgReplaceDepositForBurnResponse {}

  message MsgReceiveMessage {
    string from = 1;
    bytes message = 2;
    bytes attestation = 3;
  }

  message MsgReceiveMessageResponse { bool success = 1; }

  message MsgSendMessage {
    string from = 1;
    uint32 destination_domain = 2;
    bytes recipient = 3;
    bytes message_body = 4;
  }

  message MsgSendMessageResponse { uint64 nonce = 1; }

  message MsgSendMessageWithCaller {
    string from = 1;
    uint32 destination_domain = 2;
    bytes recipient = 3;
    bytes message_body = 4;
    bytes destination_caller = 5;
  }

  message MsgSendMessageWithCallerResponse { uint64 nonce = 1; }

  message MsgReplaceMessage {
    string from = 1;
    bytes original_message = 2;
    bytes original_attestation = 3;
    bytes new_message_body = 4;
    bytes new_destination_caller = 5;
  }

  message MsgReplaceMessageResponse {}

  message MsgUpdateSignatureThreshold {
    string from = 1;
    uint32 amount = 2;
  }

  message MsgUpdateSignatureThresholdResponse {}

  message MsgLinkTokenPair {
    string from = 1;
    uint32 remote_domain = 2;
    bytes remote_token = 3;
    string local_token = 4;
  }

  message MsgLinkTokenPairResponse {}

  message MsgUnlinkTokenPair {
    string from = 1;
    uint32 remote_domain = 2;
    bytes remote_token = 3;
    string local_token = 4;
  }

  message MsgUnlinkTokenPairResponse {}

  message MsgAddRemoteTokenMessenger {
    string from = 1;
    uint32 domain_id = 2;
    bytes address = 3;
  }

  message MsgAddRemoteTokenMessengerResponse {}

  message MsgRemoveRemoteTokenMessenger {
    string from = 1;
    uint32 domain_id = 2;
  }

  message MsgRemoveRemoteTokenMessengerResponse {}
`
const root = protobuf.parse(source).root;
const MsgDepositForBurn = root.lookupType("circle.cctp.v1.MsgDepositForBurn");
// console.log("MsgDepositForBurn: %O", MsgDepositForBurn);

module.exports = {
  MsgDepositForBurn
};