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
  return new Promise(function (resolve) {
      setTimeout(function () {
          resolve();
      }, time);
  });
};

module.exports = {
  hexCharCodeToStr,
  sleep  
}