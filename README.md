wanchain-cross-sdk
========

SDK for cross-chain based on WanBridge, it consists of several sub-modules:

<li>Core

Support cross-chain between EVM chains, and some chains which SDK does not automatically initiate transaction on them.

[@wandevs/cross-core](https://github.com/wanchain/wanchain-cross-sdk/blob/dev/packages/core)

<li>Extensions

Support cross-chain between specific chain and other chains. Each extension integrates the corresponding wallet, SDK would call wallet api to send transactions.

[@wandevs/cross-cardano](https://github.com/wanchain/wanchain-cross-sdk/blob/dev/packages/cardano)

[@wandevs/cross-polkadot](https://github.com/wanchain/wanchain-cross-sdk/blob/dev/packages/polkadot)

[@wandevs/cross-tron](https://github.com/wanchain/wanchain-cross-sdk/blob/dev/packages/tron)