const PromiseProvider = require("./promiseProvider");

const wrapCallback = function(callback) {
  if (callback == null) {
    return callback;
  }
  if (typeof callback !== 'function') {
    throw new Error('Callback must be a function, got ' + callback);
  }
  return function() {
    try {
      callback.apply(null, arguments);
    } catch (error) {
      process.nextTick(() => {
        throw error;
      });
    }
  };
};

function promiseOrCallback(callback, fn) {
  if (typeof callback === 'function') {
    return fn(function(error) {
      if (error != null) {
        try {
          callback(error);
        } catch (error) {
          return process.nextTick(() => {
            throw error;
          });
        }
        return;
      }
      callback.apply(this, arguments);
    });
  }

  const Promise = PromiseProvider.get();

  return new Promise((resolve, reject) => {
    fn(function(error, res) {
      if (error != null) {
        return reject(error);
      }
      if (arguments.length > 2) {
        return resolve(Array.prototype.slice.call(arguments, 1));
      }
      resolve(res);
    });
  });
};

function newJson(srcObj) {
  let mobj = {};
  if (typeof(srcObj) === "object") {
      mobj = Array.isArray(srcObj) ? [] : mobj;
      for (let index in srcObj) {
          if (typeof(srcObj[index]) === "object") {
              mobj[index] = newJson(srcObj[index]);
          } else {
              mobj[index] = srcObj[index];
          }
      }
  }

  return mobj;
}

exports.wrapCallback = wrapCallback;
exports.promiseOrCallback = promiseOrCallback;
exports.newJson = newJson;