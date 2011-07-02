// vanilla (https://github.com/chjj/vanilla)
// modeled after connect/express/stack/creationix
// (c) Copyright 2011, Christopher Jeffrey. (MIT Licensed)

var http = require('http')
  , path = require('path')
  , parse = require('url').parse
  , fs = require('fs')
  , join = path.join
  , read = fs.readFileSync;

var Request = http.IncomingMessage
  , Response = http.ServerResponse;

var NODE_ENV = process.env.NODE_ENV
  || (~process.argv.indexOf('--dev') && 'development')
  || (~process.argv.indexOf('--test') && 'test')
  || 'production';

// ========== BASE ========== //
var Application = function(func) {
  http.Server.call(this);
  this.init(func);
};

Application.prototype.__proto__ = http.Server.prototype;

// https - load lazily
Application.__defineGetter__('https', function _() {
  if (!_.https) {
    var https = require('https');
    _.https = function(opt, func) {
      https.Server.call(this, opt);
      this._https = true;
      this.init(func);
    };
    _.https.prototype.__proto__ = https.Server.prototype;
    Object.keys(Application.prototype).forEach(function(key) {
      _.https.prototype[key] = Application.prototype[key];
    });
  }
  return _.https;
});

// ========== vanilla ========== //
var vanilla = function() {
  var args = slice.call(arguments);
  if (typeof args[0] === 'object') {
    return new Application.https(args.shift(), args);
  }
  return new Application(args);
};

vanilla.HTTPServer = Application.http = Application;
vanilla.__defineGetter__('HTTPSServer', function() {
  return Application.https;
});

// ========== APPLICATION ========== //
Application.prototype.init = function(func) {
  var self = this;
  this.stack = [];
  this.settings = {
    root: process.cwd(),
    charset: 'utf8',
    lang: 'en',
    env: NODE_ENV
  };
  this.handle = handler(this);
  func.forEach(this.use.bind(this));
  this.__defineGetter__('router', function _() {
    if (!_.router) _.router = vanilla.router(self);
    return _.router;
  });
  this.on('request', this.handle);
  this.on('listening', function() {
    var address = this.address();
    this.port = address.port;
    this.host = address.host || '127.0.0.1';
    console.log('Listening on port %s.', this.port);
  });
};

// configuration
Application.prototype.set = function(key, val) {
  if (val === undefined) {
    return this.settings[key];
  }
  this.settings[key] = val;
};

Application.prototype.configure = function(env, func) {
  if (!func || env === this.settings.env) (func || env)();
};

Application.prototype.__defineGetter__('url', function() {
  return 'http'
    + (this._https ? 's' : '') + '://'
    + (this.settings.host || this.host)
    + (this.port != 80 ? ':' + this.port : '');
});

Application.prototype.mount = function(route, child) {
  if (route[route.length-1] === '/') {
    route = route.slice(0, -1);
  }
  child.parent = this;
  child.route = route;
  this.use(function(req, res, next) {
    var ch = req.url[route.length];
    if (req.url.indexOf(route) === 0 
        && (!ch || ch === '/')) {
      req.url = req.url.slice(route.length);

      if (req.url[0] !== '/') req.url = '/' + req.url;

      // use emit to allow regular http servers to be mounted
      child.emit('request', req, res, function(err) {
        req.app = res.app = child.parent;
        req.next = res.next = next;
        req.url = join(route, req.url);
        parsePath(req);
        next(err);
      });
    } else {
      next();
    }
  });
  if (child.settings) {
    child.settings.__proto__ = this.settings;
  }
};

// vhosting, examine the host header
Application.prototype.vhost = function(host, child) {
  child.parent = this;
  child.host = host;
  this.use(function(req, res, next) {
    var host = req.headers.host;
    if (host && host.split(':')[0] === child.host) {
      child.emit('request', req, res, function(err) {
        req.app = res.app = child.parent;
        req.next = res.next = next;
        next(err);
      });
    } else {
      next();
    }
  });
  if (child.settings) {
    child.settings.__proto__ = this.settings;
  }
};

// the same model as connect for code portability.
// eventually merge this with the router completely.
// this presents potential problems:
// - a methodOverride becomes impossible
// - the stack becomes one dimensional:
//   routes have to be placed in the right spot
var handler = function(app) {
  var stack = app.stack;
  return function(req, res, out) {
    // initialize
    req.res = res;
    res.req = req;
    req.app = res.app = app;
    req.next = res.next = next;

    // parse the path
    parsePath(req);

    var i = 0;
    function next(err) {
      var func = stack[i++];
      if (!func) {
        if (out) return out(err);
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        if (err) {
          if (http.STATUS_CODES[err]) {
            res.statusCode = err;
            return res.send(http.STATUS_CODES[err]);
          }
          res.statusCode = 500;
          res.send(app.settings.env === 'development'
            ? (err.stack || err + '')
            : 'Sorry, an error occurred.'
          );
          console.error(err.stack || err + '');
        } else {
          res.statusCode = 404;
          res.send('Not Found');
        }
        return;
      }

      var route = func.route;
      if (route) {
        var path = req.pathname
          , ch = path[route.length];
        if (path.indexOf(route) !== 0 
            || (ch && ch !== '/')) {
          return next(err);
        }
      }

      try {
        if (err) {
          if (func.length === 4) {
            func(err, req, res, next);
          } else {
            next(err);
          }
        } else if (func.length < 4) {
          func(req, res, next);
        } else {
          // skip over error handlers
          next();
        }
      } catch(e) {
        next(e);
      }
    }

    next();
  };
};

Application.prototype.use = function(route) {
  var self = this
    , func = slice.call(arguments, 1);
  if (typeof route !== 'string') {
    func.unshift(route);
    route = undefined;
  } else if (route[route.length-1] === '/') {
    route = route.slice(0, -1);
  }
  func.forEach(function(func) {
    func.route = route;
    self.stack.push(func);
  });
};

// ========== RESPONSE ========== //
// update the ETag or Last-Modified header
Response.prototype.cached = function(tag) {
  if (this.app.settings.env === 'development') return false;
  if (typeof tag === 'string' ? this.ETag(tag) : this.lastModified(tag)) {
    this.statusCode = 304;
    this.end();
    return true;
  }
};

Response.prototype.lastModified = function(last) {
  var since = this.req.headers['if-modified-since'];
  this.header('Last-Modified', last = last.valueOf());
  if (since) since = new Date(+since || since).valueOf();
  return last === since;
};

Response.prototype.ETag = function(etag, weak) {
  var none = this.req.headers['if-none-match'];
  this.header('ETag', (weak ? 'W/' : '') + '"' + etag + '"');
  if (none) none = none.replace(/^W\/|["']/gi, '');
  return etag === none;
};

Response.prototype.contentType = function(type) {
  type = mime(type);
  if (mime.text(type)) {
    type += '; charset=' + this.app.settings.charset;
  }
  this.header('Content-Type', type);
};

Response.prototype.setCookie =
Response.prototype.cookie = function(name, val, opt) {
  opt || (opt = {});
  if (opt.getTime || (opt && typeof opt !== 'object')) {
    opt = { expires: opt };
  }
  opt.expires = opt.expires || opt.maxage || opt.maxAge;
  var header =
    escape(name) + '=' + escape(val)
    + (opt.expires != null ? '; expires='
      +(!opt.expires.toUTCString
        ? new Date(Date.now() + opt.expires)
        : opt.expires
      ).toUTCString()
    : '')
    + '; path=' + (opt.path || '/')
    + (opt.domain ? '; domain=' + opt.domain : '')
    + (opt.secure ? '; secure' : '')
    + (opt.httpOnly ? '; httpOnly' : '');
  // do not overwrite other cookies!
  var current = this.header('Set-Cookie');
  if (current) {
    header = [header].concat(current);
  }
  this.header('Set-Cookie', header);
};

Response.prototype.clearCookie =
Response.prototype.uncookie = function(key, opt) {
  opt || (opt = {});
  opt.expires = new Date(Date.now() - 24 * 60 * 60 * 1000);
  this.cookie(key, '0', opt);
};

// redirect a response, automatically resolve relative paths
Response.prototype.redirect = function(path, code) {
  var res = this, req = this.req, app = this.app;
  path || (path = '/');
  code || (code = 303);
  if (!~path.indexOf('//')) {
    if (app.route) path = join(app.route, path);
    if (path[0] === '/') path = path.slice(1);
    path = 'http' + (req.socket.encrypted ? 's' : '')
           + '://' + req.headers.host + '/' + path;
  }
  // http 1.0 user agents don't understand 303's:
  // http://www.w3.org/Protocols/rfc2616/rfc2616-sec10.html
  if (code == 303 && req.httpVersionMinor < 1) {
    code = 302;
  }
  res.writeHead(+code, { 'Location': path });
  res.end();
};

Response.prototype.header = function(name, val) {
  return val !== undefined
    ? this.setHeader(name, val) || val
    : this.getHeader(name) || '';
};

Response.prototype.send = function(data) {
  var res = this, req = this.req, app = this.app;

  // no content
  if (!data) {
    res.statusCode = 204;
    return res.end();
  }

  res.statusCode || (res.statusCode = 200);

  // jsonp and json
  var buff = Buffer.isBuffer(data);
  if (req.query.callback) {
    res.contentType('application/javascript');
    data = req.query.callback
      + '(' + JSON.stringify(data) + ');';
  }
  if (typeof data === 'object' && !buff) {
    res.contentType('application/json');
    data = JSON.stringify(data);
  }

  // basic headers
  if (!res.header('Content-Type')) {
    res.contentType('text/html');
  }
  res.header('Content-Length', buff ? data.length
    : Buffer.byteLength(data)
  );
  res.header('Content-Language', app.settings.lang);
  res.header('X-UA-Compatible', 'IE=Edge,chrome=1');

  if (req.method === 'HEAD') data = undefined;

  res.end(data);
};

// serve a static file
Response.prototype.sendfile = function(file, next) {
  var res = this, req = this.req, app = this.app;
  if (!next) next = req.next;
  if (!file) return next(500);
  if (~file.indexOf('..')) {
    return next(403);
  }
  if (file[0] !== '/') {
    if (app.settings.root) {
      file = join(app.settings.root, file);
    } else {
      return next(500);
    }
  }
  fs.stat(file, function on(err, stat) {
    if (err && err.code === 'ENOENT') {
      return next(404);
    }

    if (err || !stat) {
      return next(500);
    }

    if (!stat.isFile()) {
      if (stat.isDirectory()) {
        file = join(file, 'index.html');
        return fs.stat(file, on);
      }
      return next(500);
    }

    var entity = stat.mtime.getTime() + ':' + stat.size;
    res.setHeader('ETag', entity);

    if (app.settings.env !== 'development') {
      var none = req.headers['if-none-match'];
      if (none && none === entity) {
        res.statusCode = 304;
        return res.end();
      }
    }

    res.statusCode = 200;
    if (!res.header('Content-Type')) {
      res.contentType(file);
    }
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Accept-Ranges', 'bytes');

    if (req.headers.range) {
      var range = (function() {
        var range = req.headers.range.replace(/\s/g, '')
                       .match(/^bytes=(\d*)-(\d*)$/i);
        if (!range) return;
        range[1] = range[1] || 0;
        range[2] = range[2] || stat.size;
        if (range[1] < range[2] && range[2] <= stat.size) {
          return { start: +range[1], end: +range[2] };
        }
      })();
      res.statusCode = range ? 206 : 416;
      res.setHeader('Content-Range', 'bytes '
        + (range ? range.start + '-' + range.end : '*')
        + '/' + stat.size
      );
    }

    if (req.method === 'HEAD') {
      return res.end();
    }

    sendfile(req, res, {
      path: file,
      next: next,
      range: range || {
        start: 0,
        end: stat.size
      }
    });
  });
};

// adapted from peter griess' example: https://gist.github.com/583150
// and tim smart's middleware: https://github.com/Tim-Smart/node-middleware
var sendfile = (function() {
  // in theory we could use the write watcher thats already on
  // the net.Socket object (by way of socket._writeWatcher.start()),
  // however, lib/net.js has been completely refactored for libuv,
  // so its necessary to use our own io watcher.
  var FreeList = require('freelist').FreeList
    , IOWatcher = process.binding('io_watcher').IOWatcher
    , NOOP = function() {};

  var ioWatchers = new FreeList('iowatcher', 100, function() {
    return new IOWatcher();
  });

  return function(req, res, opt) {
    var file = opt.path
      , start = opt.range.start || 0
      , end = (opt.range.end || 0) - start
      , next = opt.next;

    fs.open(file, 'r', 0666, function(err, fd) {
      if (err) return next(500);

      // ensure headers are rendered
      if (!res._header) {
        res.writeHead(res.statusCode || 200);
      }

      // force sending of the headers
      var ret = res._send('');

      var watcher = ioWatchers.alloc();
      // 1st is readable, 2nd is writable
      watcher.callback = function() {
        watcher.stop();
        send();
      };
      // 2nd is readable, 3rd is writable
      watcher.set(req.socket.fd, false, true);

      var send = function() {
        fs.sendfile(req.socket.fd, fd, start, end, function(err, written) {
          if (err) {
            if (err.code === 'EAGAIN') {
              return watcher.start();
            }
            return done(err);
          }

          start += written;
          end -= written;

          if (end > 0) return send();

          done();
        });
      };

      var done = function(err) {
        if (res.finished) return;
        req.socket.removeListener('error', done);

        watcher.stop();
        watcher.callback = NOOP;
        ioWatchers.free(watcher);

        fs.close(fd);

        res.end();

        if (err) {
          req.socket.destroy();
          next(err);
        }
      };

      req.socket.on('error', done);

      // if for whatever reason the buffer
      // is full, wait for it to drain first
      if (ret === false) {
        req.socket.once('drain', send);
      } else {
        send();
      }
    });
  };
})();

var pipefile = function(req, res, opt) {
  var file = opt.path
    , next = opt.next
    , range = opt.range;

  var stream = fs.createReadStream(file, range);
  var end = function(err) {
    if (res.finished) return;
    req.socket.removeListener('error', end);
    res.end();
    if (err) {
      req.socket.destroy();
      stream.destroy();
      next(err);
    }
  };

  stream
    .on('error', end)
    .on('end', end)
    .pipe(res, { end: false });

  res.socket.on('error', end);
};

// ========== REQUEST ========== //
// get a header, referer will fall back to the app's url
Request.prototype.header = function(key) {
  var name = key.toLowerCase()
    , head = this.headers;
  if (name === 'referer' || name === 'referrer') {
    return head.referer || head.referrer
      || 'http' + (this.socket.encrypted ? 's' : '')
        + '://' + (head.host || this.app.host) + '/';
  }
  return head[name] || '';
};

// get a cookie, here to keep api consistent
Request.prototype.cookie = function(name) {
  return this.cookies[name] || '';
};

Request.prototype.__defineGetter__('type', function() {
  var type = this.headers['content-type'];
  return type ? type.split(';')[0].trim() : '';
});

Request.prototype.__defineGetter__('xhr', function() {
  var xhr = this.headers['x-requested-with'];
  return xhr && xhr.toLowerCase() === 'xmlhttprequest';
});

// ========== VIEWS ========== //
// maybe directly embed liquor templates here
Response.prototype.local =
Response.prototype.locals = function(key, val) {
  this._locals || (this._locals = {});
  if (typeof key === 'object') {
    return merge(this._locals, key);
  }
  if (val === undefined) {
    return this._locals[key];
  }
  if (val !== null) {
    return this._locals[key] = val;
  } else {
    delete this._locals[key];
  }
};

Response.prototype.show = function(name, locals, layout) {
  if (typeof locals === 'string') {
    layout = locals;
    locals = undefined;
  }
  try {
    locals = merge(this._locals || (this._locals = {}), locals);
    return this.app.render(name, locals, layout);
  } catch(e) {
    this.req.next(e);
  }
};

Response.prototype.render = function(name, locals, layout) {
  return this.send(this.show(name, locals, layout));
};

Response.prototype.partial = function(name, locals) {
  return this.render(name, locals, false);
};

Application.prototype._compile = (function() {
  // a preprocessor for includes and inheritence
  var load = function(views, temp) {
    var parents = [], i = 0;
    temp = read(join(views, temp), 'utf8');
    temp = temp.replace(/#extends +<([^>]+)>/gi, function(__, file) {
      i = parents.push(file);
      return '';
    });
    while (i--) {
      temp = load(views, parents[i]).replace(/#body/gi, temp);
    }
    return temp.replace(/#include +<([^>]+)>/gi, function(__, file) {
      return load(views, file);
    });
  };
  return function(name) {
    var cache = this._cache || (this._cache = {});
    if (!cache[name]) {
      var template = this.set('engine');
      if (typeof template === 'string') {
        this.set('engine', template = require(template));
      }
      if (template.compile) {
        this.set('engine', template = template.compile);
      }
      cache[name] = template(load(this.set('views'), name));
    }
    return cache[name];
  };
})();

Application.prototype.render = function(name, locals, layout) {
  var self = this;
  locals || (locals = {});
  if (locals.layout) {
    layout = locals.layout;
  }
  if (layout === undefined || layout === true) {
    layout = this.set('layout');
  }
  locals.layout = function(l) { layout = l; };
  locals.partial = function(name, loc) {
    return self._compile(name)(merge(loc || {}, locals));
  };
  var ret = self._compile(name)(locals);
  if (layout) {
    locals.body = ret;
    ret = self._compile(layout)(locals);
  }
  return ret;
};

Application.prototype.partial = function(name, locals) {
  return this.render(name, locals, false);
};

// ========== MIDDLEWARE ========== //
vanilla.router = function(app) {
  var routes = {}
    , methods = ['get', 'post', 'put', 'delete'];

  methods.concat('all').forEach(function(method) {
    if (method !== 'all') {
      routes[method.toUpperCase()] = [];
    }
    app[method] = function(route) {
      var handler = slice.call(arguments, 1);
      if (typeof route === 'function') {
        handler.unshift(route);
        route = '*';
      }
      handler = flatten(handler);
      add(route, method, handler);
      return app;
    };
  });
  app.del = app['delete'];

  var add = function(route, method, handler) {
    if (Array.isArray(handler)) {
      return handler.forEach(function(h) {
        add(route, method, h);
      });
    }
    if (method === 'all') {
      var i = methods.length;
      while (i--) add(route, methods[i], handler);
    } else {
      handler.route = route;
      routes[method.toUpperCase()].push(handler);
    }
  };

  return function(req, res, out) {
    var stack = routes[req.method === 'HEAD' ? 'GET' : req.method]
      , i = 0
      , pathname = req.pathname
      , path = req.path[0];

    (function next(err) {
      if (err) return out(err);
      var handler = stack[i++];
      if (!handler) return out();
      var route = handler.route;
      if (route === '*' 
          || route === pathname 
          || route === path) {
        try {
          handler(req, res, next);
        } catch(e) {
          out(e);
        }
      } else {
        next();
      }
    })();
  };
};

vanilla.static = function(opt) {
  var path = opt.path || opt
    , list = fs.readdirSync(path);

  return function(req, res, next) {
    if (req.method !== 'GET'
        && req.method !== 'HEAD') return next();
    if (!~list.indexOf(req.path[0])) return next();
    res.sendfile(join(path, req.pathname), next);
  };
};

vanilla.favicon = function(opt) {
  var icon = fs.readFileSync(opt.path || opt);
  var head = {
    'Content-Type': 'image/x-icon',
    'Content-Length': icon.length,
    'Cache-Control': 'public, max-age=86400'
  };
  return function(req, res, next) {
    if (req.pathname.toLowerCase() === '/favicon.ico') {
      if (req.httpVersionMinor < 1) {
        res.setHeader('Expires', new Date(Date.now() + 86400000).toUTCString());
      }
      res.writeHead(200, head);
      return res.end(icon);
    }
    next();
  };
};

vanilla.cookieParser = function() {
  return function(req, res, next) {
    if (req.cookies) return next();
    req.cookies = {};
    if (req.headers.cookie) {
      try {
        var cookies = req.headers.cookie;
        if (typeof cookies !== 'string') {
          cookies = cookies.join(';');
        }
        req.cookies = parsePairs(cookies.replace(/ *[,;] */g, ';'), ';');
      } catch(e) {
        return next(e);
      }
    }
    next();
  };
};

vanilla.bodyParser = function(opt) {
  opt || (opt = {});

  var limit = opt.limit || Infinity
    , multi = opt.multipart && vanilla.multipart(opt)
    , StringDecoder = require('string_decoder').StringDecoder;

  return function(req, res, next) {
    if (req.body 
        || req.method === 'GET'
        || req.method === 'HEAD') return next();

    var body = ''
      , total = 0
      , type = req.type
      , decode;

    if (req.headers['content-length'] > limit) {
      res.statusCode = 413;
      res.end();
      return req.socket.destroy();
    }

    if (multi && ~type.indexOf('multipart')) {
      return multi(req, res, next);
    }

    decode = new StringDecoder('utf8');

    req.on('data', function(data) {
      body += decode.write(data);
      if (total += data.length > limit) {
        req.socket.destroy();
      }
    }).on('error', function(err) {
      req.socket.destroy();
      next(err);
    }).on('end', function() {
      req.body = body;
      try {
        if (type === 'application/x-www-form-urlencoded') {
          req.body = parsePairs(body, '&');
        } else if (type === 'application/json') {
          req.body = JSON.parse(body);
        }
      } catch(e) {
        return next(e);
      }
      next();
    });
  };
};

vanilla.methodOverride = function() {
  return function(req, res, next) {
    if (req.query._method) {
      req._method = req.method;
      req.method = req.query._method.toUpperCase();
      delete req.query.method;
    }
    next();
  };
};

vanilla.responseTime = function() {
  return function(req, res, next) {
    if (req.pathname === '/favicon.ico') {
      return next();
    }

    if (res._timed) return next();
    res._timed = true;

    var end = res.end
      , start = Date.now();

    res.end = function() {
      res.end = end;
      var ret = end.apply(res, arguments);
      console.log('Response Time: %s ms for %s %s',
        (Date.now() - start), req.method, req.url
      );
      return ret;
    };
    next();
  };
};

// a simple logger
vanilla.log = function(opt) {
  opt || (opt = {});
  if (typeof opt === 'string') {
    opt = { path: opt };
  }

  var out = []
    , written = 0
    , path = opt.path || '/tmp/http.log'
    , limit = opt.limit || 20 * 1024 * 1024
    , log = opt.stream || fs.createWriteStream(path);

  var push = function(data) {
    if (written > limit) return;
    var len = out.push(data);
    written += data.length;
    if (len >= 20) {
      log.write(out.join('\n') + '\n');
      out = [];
    }
  };

  return function(req, res, next) {
    if (req.pathname === '/favicon.ico') {
      return next();
    }

    if (req._logged) return next();
    req._logged = true;

    var start = Date.now()
      , head = req.headers
      , writeHead = res.writeHead;

    res.writeHead = function(code) {
      res.writeHead = writeHead;
      push(
        req.method + ' "' + req.url + '"'
        + ' from [' + req.socket.remoteAddress + ']'
        + ' at [' + (new Date()).toISOString() + ']'
        + ' -> ' + (code || res.statusCode)
        + ' (' + (Date.now() - start) + 'ms)' + '\n'
        + '  Referrer: ' + (head.referrer || head.referer || 'None') + '\n'
        //+ '  User-Agent: ' + (head['user-agent'] || 'Unknown') + ')' + '\n'
      );
      return writeHead.apply(res, arguments);
    };
    next();
  };
};

vanilla.auth = function(opt) {
  var crypto = require('crypto');
  var hash = function(pass) {
    return crypto.createHmac('sha256', secret)
                 .update(pass).digest('base64');
  };
  var users = opt.users
    , secret = opt.secret
    , realm = opt.realm || 'secure area';
  return function(req, res, next) {
    if (req.username) return next();
    var auth = req.headers.authorization;
    if (auth) {
      var s = auth.split(' ')
        , scheme = s[0]
        , pair = new Buffer(s[1], 'base64').toString('utf8').split(':')
        , user = pair[0]
        , pass = pair[1];

      if (scheme === 'Basic' && users[user] === hash(pass)) {
        req.username = user;
        return next();
      }
    }
    res.statusCode = 401;
    res.header('WWW-Authenticate', 'Basic realm="' + realm + '"');
    res.end();
  };
};

vanilla.session = function(opt) {
  var crypto = require('crypto');

  if (!opt || !opt.secret) {
    throw new
      Error('`secret` must be provided for sessions.');
  }

  var secret = opt.secret
    , life = opt.life || 2 * 7 * 24 * 60 * 60 * 1000;

  var hmac = function(data) {
    return crypto.createHmac('sha256', secret)
                 .update(data).digest('base64');
  };

  // maybe swap ciphers and hmacs for better security
  var stringify = function(data, flag) {
    if (!data) data = {};
    try {
      var time = Date.now().toString(36);

      data = JSON.stringify(data);
      flag = flag || time;

      // hack to get around the base64 bug
      var ci = crypto.createCipher('bf-cbc', secret);
      data = new Buffer(
        ci.update(data, 'utf8', 'binary')
        + ci.final('binary'), 'binary'
      ).toString('base64');

      // would normally need to qs.escape, but
      // res.cookie takes care of this
      data = [hmac(data + flag), data, time].join(':');

      // http://tools.ietf.org/html/rfc6265#page-27
      if (Buffer.byteLength(data) <= 4096) {
        return data;
      }
    } finally {
      return stringify({}, flag);
    }
  };

  var parse = function(cookie, flag) {
    if (!cookie) return {};
    try {
      var s = cookie.split(':')
        , mac = s[0]
        , data = s[1]
        , time = s[2];

      flag = flag || time;
      time = parseInt(time, 36);

      if (mac === hmac(data + flag) && time > (Date.now() - life)) {
        var dec = crypto.createDecipher('bf-cbc', secret);
        data = dec.update(data, 'base64', 'utf8') + dec.final('utf8');
        return JSON.parse(data);
      }
    } finally {
      return {};
    }
  };

  return function(req, res, next) {
    if (req.pathname === '/favicon.ico') {
      return next();
    }
    if (req.session) return next();

    var ip = req.socket.remoteAddress
      , writeHead = res.writeHead;

    req.session = parse(req.cookies.session, ip);
    res.writeHead = function() {
      res.writeHead = writeHead;
      if (req.session) {
        var data = stringify(req.session, ip);
        res.cookie('session', data, {
          maxAge: life, httpOnly: true
        });
      } else {
        res.clearCookie('session');
      }
      return writeHead.apply(res, arguments);
    };
    next();
  };
};

// ========== HELPERS ========== //
var escape = function(str) {
  return encodeURIComponent(str).replace(/%20/g, '+');
};
var unescape = function(str) {
  try {
    return decodeURIComponent(str.replace(/\+/g, ' '));
  } catch(e) {
    return str;
  }
};

var parsePairs = function(qs, del) {
  if (!qs) return {};

  var out = {}
    , s = qs.split(del || '&')
    , i = s.length
    , $;

  while (i--) {
    $ = s[i].split('=');
    if ($[0]) {
      $[0] = unescape($[0]);
      $[1] = $[1] ? unescape($[1]) : '';
      out[$[0]] = $[1];
    }
  }

  return out;
};

var parsePath = function(req) {
  var uri = parse(req.url)
    , pathname = uri.pathname || '/';

  if (pathname[pathname.length-1] === '/') {
    pathname = pathname.slice(0, -1);
  }

  pathname = unescape(pathname);

  req.path = (function() {
    var path = pathname;
    if (path[0] === '/') {
      path = path.slice(1);
    }
    path = path.split('/');
    if (!path[0]) return [];
    return path;
  })();

  req.pathname = pathname || '/';

  // get rid of absolute urls
  if (~req.url.indexOf('//')) {
    req.url = req.url.replace(/^([^:\/]+)?\/\/[^\/]+/, '') || '/';
  }

  req.query || (req.query = uri.query ? parsePairs(uri.query, '&') : {});
};

var slice = [].slice;

var merge = function(o, t) {
  if (o && t) for (var k in t) o[k] = t[k];
  return o || {};
};

var flatten = function(obj) {
  var out = [];
  (function flatten(obj) {
    for (var i = 0, l = obj.length; i < l; i++) {
      if (Array.isArray(obj[i])) {
        flatten(obj[i]);
      } else {
        out.push(obj[i]);
      }
    }
  })(obj);
  return out;
};

var mime = (function() {
  // only the most useful mime
  // types for the web are here
  var types = {
    'atom': 'application/atom+xml',
    'bin': 'application/octet-stream',
    'bmp': 'image/bmp',
    'css': 'text/css',
    'form': 'application/x-www-form-urlencoded',
    'gif': 'image/gif',
    'gz': 'application/x-gzip',
    'htc': 'text/x-component',
    'html': 'text/html',
    'ico': 'image/x-icon',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'js': 'application/javascript',
    'json': 'application/json',
    'log': 'text/plain',
    'manifest': 'text/cache-manifest',
    'mathml': 'application/mathml+xml',
    'mml': 'application/mathml+xml',
    'mp3': 'audio/mpeg',
    'mp4': 'video/mp4',
    'mpeg': 'video/mpeg',
    'mpg': 'video/mpeg',
    'oga': 'audio/ogg',
    'ogg': 'application/ogg',
    'ogv': 'video/ogg',
    'otf': 'font/otf',
    'pdf': 'application/pdf',
    'png': 'image/png',
    'rdf': 'application/rdf+xml',
    'rss': 'application/rss+xml',
    'svg': 'image/svg+xml',
    'swf': 'application/x-shockwave-flash',
    'tar': 'application/x-tar',
    'torrent': 'application/x-bittorrent',
    'txt': 'text/plain',
    'ttf': 'font/ttf',
    'webm': 'video/webm',
    'woff': 'font/x-woff',
    'xhtml': 'application/xhtml+xml',
    'xbl': 'application/xml',
    'xml': 'application/xml',
    'xsl': 'application/xml',
    'xslt': 'application/xslt+xml',
    'zip': 'application/zip'
  };
  var mime = function(tag) {
    tag = (tag || '').split('.').pop();
    if (types[tag]) return types[tag];
    return ~tag.indexOf('/')
      ? tag.split(';')[0]
      : types.bin;
  };
  mime.text = function(type) {
    return type
      && (type === types.js
      || type === types.json
      || type === types.form
      || type.indexOf('text') === 0
      || type.slice(-3) === 'xml');
  };
  return mime;
})();

// expose
module.exports = exports = vanilla.createServer = vanilla;