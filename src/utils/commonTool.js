function sortAssetPairs(assetPairList) {

  let mapAssetPairs = new Map();
  for(let i=0; i<assetPairList.length; i++){
    let assetType = assetPairList[i].assetType;
    let assetAry = mapAssetPairs.get(assetType);
    if(!assetAry){
      assetAry = new Array();
    }
    assetAry.push(assetPairList[i]);
    mapAssetPairs.set(assetType, assetAry);
  }

  let assetPairs = [];
  for(let [type, aryObj] of mapAssetPairs){
    for(let j=0; j< aryObj.length; j++){
      assetPairs.push(aryObj[j]);
    }
  }

  return assetPairs;
}

function  sortArrayMembers(inputAry) {
  
  inputAry.sort((a, b)=>{return -(parseInt(a.ccTaskId) - parseInt(b.ccTaskId))});

  return inputAry;
}

function hexCharCodeToStr(hexCharCodeStr) {
  if(!hexCharCodeStr){
    return '';
  }

  let trimedStr = hexCharCodeStr.trim();
  let rawStr = trimedStr.substr(0, 2).toLowerCase() === '0x' ? trimedStr.substr(2) : trimedStr;
  let len = rawStr.length;
  if (len % 2 !== 0) {
      return '';
  }
  let resultStr = [];
  for (var i = 0; i < len; i = i + 2) {
      let tmpStr = rawStr.substr(i, 2);
      if (tmpStr !== '00') {
        resultStr.push(String.fromCharCode(parseInt(tmpStr, 16)));
      }
  }
  return resultStr.join('');
}

async function sleep(time) {
  return new Promise(function (resolve, reject) {
      setTimeout(function () {
          resolve();
      }, time);
  });
};

module.exports = {
  sortAssetPairs,
  sortArrayMembers,
  hexCharCodeToStr,
  sleep  
}