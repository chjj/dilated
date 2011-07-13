// liquor - javascript templates
// Copyright (c) 2011, Christopher Jeffrey (MIT Licensed)
(function() {
var liquor = (function() {
  var foreach = function(obj, func) {
    if (!obj) return;

    if (typeof obj.length === 'number' 
        && typeof obj !== 'function') {
      var i = 0
        , l = obj.length;

      for (; i < l; i++) {
        if (func.call(obj[i], obj[i]
            , i, obj) === false) break;
      }
    } else {
      var k = Object.keys(obj)
        , i = 0
        , l = k.length
        , key;

      for (; i < l; i++) {
        key = k[i];
        if (func.call(obj[key], obj[key]
            , key, obj) === false) break;
      }
    }
  };

  // rules
  var each = /([ \t]*)@:([^\s]+)[ \t]*([^\n]*(?:\n+\1(?:[ ]{2}|\t)[^\n]+)*)/
    , cond = /([ \t]*)(?:\?|(!)):([^\s]+)[ \t]*([^\n]*(?:\n+\1(?:[ ]{2}|\t)[^\n]+)*)/;

  return function(str, opt) {
    // normalize newlines 
    // escape double quotes
    str = str.replace(/\r\n/g, '\n')
             .replace(/\r/g, '\n')
             .replace(/"/g, '\\"');

    // pre-preprocessing for shorthand 
    // notations and sig-whitespace here
    while (each.test(str)) str = str.replace(each, 
      '\n$1`each($2, function(v) {`$3  $1\n$1`})`'
    );
    while (cond.test(str)) str = str.replace(cond,
      '\n$1`if ($2(typeof $3 !== "undefined" && $3)) \
        {`$4  $1\n$1`}`'
    );

    // evaluate and interpolate
    str = str.replace(/`([^`]+)`/g, '"); $1; __out.push("')
             .replace(/#{([^}]+)}/g, '", ($1), "');

    // wrap
    str = 'with ($) { var __out = []; __out.push("'
          + str + '"); return __out.join(""); }';

    // drop the line feeds
    str = str.replace(/\n/g, '\\n');

    if (opt === 'debug') return str;

    var func = new Function('$, each', str);
    return function(locals) {
      return func(locals || {}, foreach);
    };
  };
})();

liquor.compile = liquor;

// expose
if (typeof module !== 'undefined' && module.exports) {
  module.exports = liquor;
} else {
  this.liquor = liquor;
}

// shim for the client-side
if (!Object.keys) Object.keys = function(o) {
  var k, c = []; 
  if (o) for (k in o) if (c.hasOwnProperty.call(o, k)) c.push(k);
  return c;
};

}).call(this);