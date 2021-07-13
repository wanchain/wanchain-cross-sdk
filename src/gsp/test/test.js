"use strict";

let CheckScEvent = require("./testkScEvent");

async function test_main() {
    try {
        console.log("test_main start")
        let checkEvent = new CheckScEvent();
        let netInfo = await getNetInfo("testnet");
        await checkEvent.init(netInfo);

        let obj = {
            "chainType": "WAN",
            uniqueID: "0x06C43B9EFD1849D86FBC63AD0BB585C3A08E743A260CB7057115BCF71E2456BB",
            //uniqueID: "0x2d9ab1890c451492d9409f3cd9bad9ec3c1f33d818d259d89406f67b0ecb941f",
            fromBlockNumber: 12514100
            //_fromBlockNumber: 13588600
            //   _end: 13589326,
            //_fromBlockNumber: 13589300,
        };

        await checkEvent.processSmgMintLogger(obj);
    }
    catch (err) {
        console.log("test_main err:", err);
    }
}


async function getNetInfo(net) {
    let retObj = {};
    if (net === "mainnet") {
        retObj.chainInfo = {// mainnet
            "chainType": "WAN",
            "crossScAddr": "0xe85b0d89cbc670733d6a40a9450d8788be13da47",
            "crossScAbi": "./abi/abi.CrossDelegate.json"
        };
        retObj.iWanOption = {
            "options": [
                {
                    "url": "api.wanchain.org",
                    "port": 8443,
                    "flag": "ws",
                    "version": "v3"
                }
            ],
            "apiKey": "26f480f593fa68c26d59f4942f380b8ad6171fbda226aaac7929c73ee44b38df",
            "secretKey": "27b271d205078ef14aa097ae343e154a9f93a0ed3b2c0bcd38b7b1a6f02b6747"
        };
    }
    else {//if(net === "testnet") {// testnet
        retObj.chainInfo = {
            "chainType": "WAN",
            "crossScAddr": "0x62de27e16f6f31d9aa5b02f4599fc6e21b339e79",
            "crossScAbi": "./abi/abi.CrossDelegate.json"
        };
        retObj.iWanOption = {
            "options": [
                {
                    "url": "apitest.wanchain.org",
                    "port": 8443,
                    "flag": "ws",
                    "version": "v3"
                }
            ],
            "apiKey": "dd5dceb07ae111aaa2693ccaef4e5f049d0b2bc089bee2adbf0509531f867f59",
            "secretKey": "4928108949fa444f127198acbd2a89baa9d57a0a618794cb7a2fe12986b52c04"
        };
    }
    return retObj;
}

test_main();
