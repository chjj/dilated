// (c) Copyright 2011, Christopher Jeffrey.
// an attempt at implementing the most recent www-style proposals
// as well as some extra css features

var fs = require('fs')
  , join = require('path').join;

var style = exports;
var cache = style.cache = {};

var img = {
  'png': 'image/png',
  'gif': 'image/gif',
  'jpg': 'image/jpeg',
  'svg': 'image/svg+xml'
};

style.middleware = style.handle = function(opt) {
  return function(req, res, next) {
    var file = opt.file;
    if (!file) {
      if (~req.url.indexOf('.css')) {
        file = req.pathname
          || req.pathname = require('url').parse(req.url).pathname;
        if (~file.indexOf('..')) return next(403);
      } else {
        return next();
      }
    }
    if (opt.cache) {
      var cached = cache[file];
      if (cached) {
        res.setHeader('Last-Modified', cached.updated);
        var since = +req.headers['if-modified-since'];
        if (since && since === cached.updated) {
          res.statusCode = 304;
          return res.end();
        }
      }
    }
    style.file(file, function(err, css) {
      if (err) return next(err);
      res.setHeader('Content-Type', 'text/css; charset=utf-8');
      res.setHeader('Content-Length', !Buffer.isBuffer(css)
        ? Buffer.byteLength(css)
        : css.length
      );
      res.end(css);
    }, opt);
  };
};

style.file = function(file, func, opt) {
  fs.stat(file, function(err, stat) {
    if (err) return func(err);

    var mtime = stat.mtime.getTime()
      , cached = cache[file] || (cache[file] = {});

    cached.updated = mtime;
    if (opt.cache) {
      if (cached.data && mtime <= cached.updated) {
        return func(null, cached.data);
      }
    }

    fs.readFile(file, 'utf8', function(err, css) {
      if (err) return func(err);
      style.preprocess(css, function(err, css) {
        if (err) return func(err);
        if (opt.cache) {
          css = cached.data = new Buffer(css);
        }
        func(null, css);
      }, opt);
    });
  });
};

style.preprocess = function(css, func, opt) {
  // normalize newlines
  var start = function() {
    css = css.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    images();
  };

  // replace image url's with base64's
  var images = function() {
    var pending = 0;
    css.replace(/url\(([^)]+)\)/gi, function(str, path) {
      path = path.replace(/['"]/g, '').trim();
      var ext = path.split('.').pop();
      if (~path.indexOf('//') || !img[ext]) {
        return;
      }
      pending++;
      fs.readFile(join(opt.dir, path), 'base64', function(err, data) {
        if (!err) css = css.replace(str,
          'url("data:' + img[ext] + ';base64,' + data + '")'
        );
        --pending || sugar();
      });
    });
    if (!pending) sugar();
  };

  // misc sugar
  var sugar = function() {
    // add variable support
    if (~css.indexOf('@var')) {
      var vars = [];
      css = css.replace(
        /@var[ \t]+(\$[^\s;]+)[ \t]+([^\n;]+);\s*/gi,
        function(__, name, val) {
          vars[name] = val;
          return '';
        }
      ).replace(/\$[\w\-]+/g, function(name) {
        return vars[name] || name;
      });
    }

    // allow for multiline syntax, useful for gradients
    css = css.replace(/:[^{};]+;/g, function($0) {
      return $0.replace(/[ \t]*\\?\n+[ \t]*/g, '');
    });

    // minify
    if (opt.minify) {
      css = css
        // remove comments
        .replace(/\/\*[\s\S]*?\*\//g, '')
        // trim space before characters
        .replace(/\s+({|})/g, '$1')
        // trim space after characters
        .replace(/(;|,|:|{|}|^)\s+/g, '$1')
        // trim combinators
        .replace(/\s+(>|\+|~)\s+/g, '$1')
        // remove escaped newlines and spaces
        .replace(/\\\r?\n\s+/g, '')
        // remove trailing semicolons in rules
        .replace(/;(})/g, '$1');
    }

    imports();
  };

  // import other css files,
  // recursively preprocess them
  var imports = function() {
    var pending = 0;
    var child = { // hack
      dir: opt.dir,
      minify: opt.minify,
      cache: false // important
    };
    css.replace(/@import[ \t]+"([^"]+)"[ \t]*;\s*/gi, function(str, path) {
      pending++;
      style.file(join(opt.dir, path.trim()), function(err, data) {
        if (!err && data) {
          css = css.replace(str, data + '\n\n');
        }
        --pending || done();
      }, child);
    });
    if (!pending) done();
  };

  var done = function() {
    func(null, css);
  };

  start();
};

// mixins and nested rules - not implemented yet as they are
// very up in the air at the moment (Tab Atkins hasn't even drafted a spec)

// ========== MIXINS ========== //
// should work, but not tested yet
var mixin = 1 || function(css) {
  var traits = {};

  css = css.replace(
    /@trait[ \t]+([\w\-]+)(?:\(([^)]+)\))?\s*{([^}]+)}/g,
    function(str, name, params, body) {
      params = params ? params.split(/\s*,\s*/) : [];
      params = (function() {
        var p = {};
        params.forEach(function(v, i) {
          p[v] = i;
        });
        return p;
      })();
      traits[name] = function() {
        var args = arguments;
        return body.replace(/\$[\w\-]+/g, function(name) {
          return args[params[name]] || name;
        });
      };
      return '';
    }
  );

  css = css.replace(
    /@mixin[ \t]+([\w\-]+)\s*(?:\(([^)]+)\))?;/g,
    function(str, name, args) {
      if (!traits[name]) {
        throw new
          SyntaxError('Non-existent mixin: ' + name);
      }
      // because commas can appear in css property values,
      // the proposed solution for placing them in parameters
      // was to enclose them in parantheses. this is a
      // shameless hack to account for it because i
      // dont want to write a real parser
      args = args.replace(/\(([^)]+)\)/g, function(__, s) {
        return s.replace(/,/g, '~~');
      });
      args = args.replace(/,/g, '##');
      args = args.replace(/~~/g, ',');
      args = args ? args.split(/\s*##\s*/) : [];
      return traits[name].apply(null, args);
    }
  );

  return css;
};

// ========== NESTED RULES ========== //
// strip whitespace and comments
var clean = 1 || function(str) {
  return str
    .replace(/\/\*[\s\S]+?\*\//g, '')
    .replace(/^\s+|\s+$/g, '')
    .replace(/^\*\//, '')
    .replace(/\/\*$/, '');
};

var nested = 1 || function(css) {
  var cap
    , subject
    , selector
    , props
    , stack = []
    , sel = []
    , out = [];

  var state = function() {
    return stack[stack.length-1];
  };

  while (cap = css.match(/^([^{}]*)({|};?)/)) {
    css = css.slice(cap[0].length);
    subject = clean(cap[1]);
    if (cap[2] === '{') {
      // entering an at rule
      if (~subject.indexOf('@')) {
        stack.push('IN_AT_RULE');
        out.push(subject + '{');
      } else {
        if (state() === 'IN_RULE') {
          // entering nested rule
          subject = subject.split(';');
          selector = subject.pop().replace(/&/g, sel[sel.length-1]);
          props = subject.join(';');
          out.push(props + '}');
        } else {
          // entering regular rule
          selector = subject;
        }
        stack.push('IN_RULE');
        out.push(selector + '{');
        sel.push(selector);
      }
    } else {
      stack.pop();
      // left a rule into an at rule
      if (state() === 'IN_AT_RULE') {
        out.push(subject + '}');
      } else {
        // left a rule into the top level or another rule
        sel.pop();
        out.push(subject + '}');
        if (state() === 'IN_RULE') {
          // left a rule into a rule
          out.push(sel[sel.length-1] + '{');
        }
      }
      // too many curly braces
    }
  }

  return out.join('\n').replace(/[^{}]+{\s+}/g, '');
};

/* lazy copy & paste testing for nesting
var nest = [
'',
'div {',
'  background: green;',
'  & > span {',
'    color: orange;',
'  };',
'}',
'a {',
'  color: red;',
'  & > b {',
'    color: orange;',
'  };',
'  & > em {',
'    color: grey;',
'  };',
'  & > i {',
'    color: yellow;',
'    &:hover {',
'      color: blue;',
'    };',
'  };',
'  font-weight: bold;',
'}',
'div {',
'  background: pink;',
'}',
'div {',
'  background: lightred;',
'}',
''
].join('\n');

console.log(nested(nest));*/
