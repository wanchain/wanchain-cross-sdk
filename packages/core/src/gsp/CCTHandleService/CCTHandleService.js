import ccTypeConfig from "../../config/ccTypeConfig/ccTypeConfig.js";

class CCTHandleService {
  constructor() {
    this.mapCCTypeToHandler = new Map(); // ccType => Hanlder
  }

  async init(frameworkService) {
    try {
      this.frameworkService = frameworkService;
      for (let idx = 0; idx < ccTypeConfig.length; ++idx) {
        let obj = ccTypeConfig[idx];
        this.mapCCTypeToHandler.set(obj.name, obj.handle);
      }
    } catch (err) {
      console.log("CCTHandleService init err:", err);
    }
  }

  async getConvertInfo(convert) {
    let tokenPairService = this.frameworkService.getService("TokenPairService");
    let tokenPair = tokenPairService.getTokenPair(convert.tokenPairId);
    let handler;
    if (convert.handler) { // some simple tasks directly specify handlers, not associated with cross-chain tasks
      let simpleHandle = this.mapCCTypeToHandler.get(convert.handler);
      handler = new simpleHandle(this.frameworkService);
    } else {
      let ccType = tokenPair.ccType[convert.convertType];
      let CCTypeHandle = this.mapCCTypeToHandler.get(ccType);
      handler = new CCTypeHandle(this.frameworkService);
    }
    let steps = await handler.process(tokenPair, convert);
    return steps;
  }

  async addCCTHandle(ccType, CCTHandle) {
    this.mapCCTypeToHandler.set(ccType, CCTHandle);
  }
}

export default CCTHandleService;
