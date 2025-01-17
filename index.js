'use strict';
var strictUriEncode = require('strict-uri-encode');
var decodeComponent = require('decode-uri-component');
var splitOnFirst = require('split-on-first');

function encoderForArrayFormat(options) {
  switch (options.arrayFormat) {
    case 'index':
      return function(key) {
        return function (result, value) {
          var index = result.length;
          if (value === undefined) {
            return result;
          }

          if (value === null) {
            return [].concat(result, [[encode(key, options), '[', index, ']'].join('')]);
          }

          return [].concat(result, [[encode(key, options), '[', encode(index, options), ']=', encode(value, options)].join('')] );
        }
      };

    case 'bracket':
      return function (key) {
        return function (result, value) {
          if (value === undefined) {
            return result;
          }

          if (value === null) {
            return [].concat(result, [[encode(key, options), '[]'].join('')]);
          }

          return [].concat(result, [[encode(key, options), '[]=', encode(value, options)].join('')] );
        };
      };

    case 'comma':
      return function (key) {
        return function (result, value, index) {
          if (value === null || value === undefined || value.length === 0) {
            return result;
          }

          if (index === 0) {
            return [[encode(key, options), '=', encode(value, options)].join('')];
          }

          return [[result, encode(value, options)].join(',')];
        };
      };

    default:
      return function(key) {
        return function (result, value) {
          if (value === undefined) {
            return result;
          }

          if (value === null) {
            return [].concat(result, [encode(key, options)]);
          }

          return [].concat(result, [[encode(key, options), '=', encode(value, options)].join('')]);
        };
      }
  }
}

function parserForArrayFormat(options) {
  var result;

  switch (options.arrayFormat) {
    case 'index':
      return function(key, value, accumulator) {
        result = /\[(\d*)\]$/.exec(key);

        key = key.replace(/\[\d*\]$/, '');

        if (!result) {
          accumulator[key] = value;
          return;
        }

        if (accumulator[key] === undefined) {
          accumulator[key] = {};
        }

        accumulator[key][result[1]] = value;
      };

    case 'bracket':
      return function(key, value, accumulator)  {
        result = /(\[\])$/.exec(key);
        key = key.replace(/\[\]$/, '');

        if (!result) {
          accumulator[key] = value;
          return;
        }

        if (accumulator[key] === undefined) {
          accumulator[key] = [value];
          return;
        }

        accumulator[key] = [].concat(accumulator[key], value);
      };

    case 'comma':
      return function(key, value, accumulator)  {
        var isArray = typeof value === 'string' && value.split('').indexOf(',') > -1;
        var newValue = isArray ? value.split(',') : value;
        accumulator[key] = newValue;
      };

    default:
      return function(key, value, accumulator)  {
        if (accumulator[key] === undefined) {
          accumulator[key] = value;
          return;
        }

        accumulator[key] = [].concat(accumulator[key], value);
      };
  }
}

function encode(value, options) {
  if (options.encode) {
    return options.strict ? strictUriEncode(value) : encodeURIComponent(value);
  }

  return value;
}

function decode(value, options) {
  if (options.decode) {
    return decodeComponent(value);
  }

  return value;
}

function keysSorter(input) {
  if (Array.isArray(input)) {
    return input.sort();
  }

  if (typeof input === 'object') {
    return keysSorter(Object.keys(input))
      .sort(function(a, b){ return Number(a) - Number(b) })
      .map(function(key) {return input[key]});
  }

  return input;
}

function removeHash(input) {
  var hashStart = input.indexOf('#');
  if (hashStart !== -1) {
    input = input.slice(0, hashStart);
  }

  return input;
}

function extract(input) {
  input = removeHash(input);
  var queryStart = input.indexOf('?');
  if (queryStart === -1) {
    return '';
  }

  return input.slice(queryStart + 1);
}

function parse(input, options) {
  options = Object.assign({
    decode: true,
    sort: true,
    arrayFormat: 'none',
    parseNumbers: false,
    parseBooleans: false
  }, options);

  var formatter = parserForArrayFormat(options);

  // Create an object with no prototype
  var ret = Object.create(null);

  if (typeof input !== 'string') {
    return ret;
  }

  input = input.trim().replace(/^[?#&]/, '');

  if (!input) {
    return ret;
  }

  var list = input.split('&');
  for (var i = 0; i < list.length; i++ ) {
    var param = list[i];
    var pair = splitOnFirst(param.replace(/\+/g, ' '), '=');
    var key = pair[0],
      value = pair[1];
    // Missing `=` should be `null`:
    // http://w3.org/TR/2012/WD-url-20120524/#collect-url-parameters
    value = value === undefined ? null : decode(value, options);

    if (options.parseNumbers && !Number.isNaN(Number(value))) {
      value = Number(value);
    } else if (options.parseBooleans && value !== null && (value.toLowerCase() === 'true' || value.toLowerCase() === 'false')) {
      value = value.toLowerCase() === 'true';
    }

    formatter(decode(key, options), value, ret);
  }

  if (options.sort === false) {
    return ret;
  }

  return (options.sort === true ? Object.keys(ret).sort() : Object.keys(ret).sort(options.sort)).reduce(function(result, key)  {
    var value = ret[key];
    if (Boolean(value) && typeof value === 'object' && !Array.isArray(value)) {
      // Sort object keys, not values
      result[key] = keysSorter(value);
    } else {
      result[key] = value;
    }

    return result;
  }, Object.create(null));
}

exports.extract = extract;
exports.parse = parse;

exports.stringify = function(object, options)  {
  if (!object) {
    return '';
  }

  options = Object.assign({
    encode: true,
    strict: true,
    arrayFormat: 'none'
  }, options);

  var formatter = encoderForArrayFormat(options);
  var keys = Object.keys(object);

  if (options.sort !== false) {
    keys.sort(options.sort);
  }

  return keys.map(function(key) {
    var value = object[key];

    if (value === undefined) {
      return '';
    }

    if (value === null) {
      return encode(key, options);
    }

    if (Array.isArray(value)) {
      return value
        .reduce(formatter(key), [])
        .join('&');
    }

    return encode(key, options) + '=' + encode(value, options);
  }).filter(function(x) { return x.length > 0 } ).join('&');
};

exports.parseUrl = function(input, options)  {
  return {
    url: removeHash(input).split('?')[0] || '',
    query: parse(extract(input), options)
  };
};
