/**
 * dilated: dilated.js
 * Copyright (c) 2011-2014, Christopher Jeffrey (MIT License)
 */

/**
 * Modules
 */

var fs = require('fs')
  , path = require('path')
  , http = require('http')
  , EventEmitter = require('events').EventEmitter;

var express = require('express')
  , csslike = require('csslike')
  , liquor = require('liquor');

var data = require('./data')
  , handle = require('./handle')
  , utils = require('./utils')
  , config = require('./config');

/**
 * Server
 */

function Server(options) {
  if (!(this instanceof Server)) {
    return new Server(options);
  }

  options = options || {};

  var self = this
    , conf = config.checkConfig(options);

  EventEmitter.call(this);

  this.conf = conf;

  this.app = express();

  // For mounting with connect's app.use():
  this.handle = this.app;

  if (conf.env) {
    this.app.set('env', conf.env);
  }

  this.server = conf.https && conf.https.key
    ? require('https').createServer(conf.https)
    : require('http').createServer();

  this.server.on('listening', function() {
    self.log('Listening on port \x1b[1m%s\x1b[m.', conf.port);
  });

  this.init();
}

Server.prototype.__proto__ = EventEmitter.prototype;

Server.prototype.init = function() {
  this.init = function() {};

  this.modules = {};
  this.modules.data = data(this);
  this.modules.handle = handle(this);

  this.initConfig();
  this.initMiddleware();
  this.initRoutes();
};

/**
 * Configure
 */

Server.prototype.initConfig = function() {
  var self = this
    , app = this.app
    , conf = this.conf;

  app.configure('development', function() {
    conf.port = conf.port || 8080;
  });

  app.configure('production', function() {
    conf.port = conf.port || (conf.https ? 443 : 80);
    if (conf.https && conf.redir) {
      self._rserver = http.createSever(function(req, res) {
        return self._redirectHost('https', req, res, function() {});
      }).listen(80);
    }
  });

  app.set('root', conf.root);
  app.set('views', conf.root + '/view');
  app.engine('.html', liquor.renderFile);
  app.engine('.xml', liquor.renderFile);
};

/**
 * Middleware
 */

Server.prototype.initMiddleware = function() {
  var self = this
    , app = this.app
    , conf = this.conf
    , Post = this.modules.data.Post;

  app.configure('production', function() {
    if (conf.redir) {
      app.use(function(req, res, next) {
        var protocol = conf.https ? 'https' : 'http';
        return self._redirectHost(protocol, req, res, next);
      });
    }
  });

  app.configure('development', function() {
    app.use(express.responseTime());
  });

  app.use(function(req, res, next) {
    req.pathParts = req.path.replace(/^\/+|\/+$/g, '').split('/');
    next();
  });

  if (conf.log) {
    app.use(express.logger({
      stream: fs.createWriteStream(conf.log)
    }));
  }

  app.use(express.favicon(conf.root + '/static/favicon.ico'));
  app.use(express.cookieParser());

  app.use(function(req, res, next) {
    var currentTag = req.pathParts[0];
    if (req.pathParts[0] === 'browse'
        && req.pathParts[1]
        && !/^\d+$/.test(req.pathParts[1])) {
      currentTag = req.pathParts[1];
    }
    res.login = req.cookies.user === conf.pass;
    res.locals({
      rel: undefined,
      login: res.login,
      tags: Post.buildTags(Post.tags.slice(0, 6), currentTag),
      path: req.pathParts,
      root: conf.webRoot
    });
    next();
  });

  app.use(require('body-parser').urlencoded({
    limit: '10mb'
  }));

  app.use(require('compression')());

  app.use('/liquorice',
    csslike.handle({
      file: conf.root + '/static/style.css',
      dir: conf.root,
      minify: app.settings.env !== 'development',
      cache: app.settings.env !== 'development'
    })
  );

  app.use(app.router);

  app.use(express.static(conf.root + '/static'));

  app.error(function(err, req, res) {
    if (res.finished) return;
    res.render('error.html', {
      title: err.phrase,
      message: err.body || err.phrase,
      back: req.header('referer') || '.'
    });
  });

  app.use(function(err, req, res, next) {
    res.error(err);
  });

  app.use(function(req, res, next) {
    res.error(404);
  });

  /**
   * Error Handling
   */

  app.configure('production', function() {
    if (process.listeners('uncaughtException').length) return;
    process.on('uncaughtException', function(err) {
      err = err.stack || err + '';
      self.error(new Date().toISOString() + ': ' + err);
    });
  });
};

/**
 * Routes
 */

Server.prototype.initRoutes = function() {
  var self = this
    , handle = this.modules.handle
    , app = this.app;

  app.get('/feed', handle.feed);

  app.get('/logout', handle.logout);
  app.get('/admin', handle.admin);
  app.post('/admin', handle.login);

  app.get('/browse/:year?', handle.year);

  app.get('/sitemap.xml', handle.sitemap);

  app.get('/', handle.search);

  app.get('/-/*', function(req, res, next) {
    res.send('Reserved.');
  });

  app.get('*', handle.display);

  app.post('*', handle.modify);
  app.put('*', handle.modify);
  app.del('*', handle.modify);
};

Server.prototype.log = function() {
  return console.log.apply(console, arguments);
};

Server.prototype.error = function() {
  return console.error.apply(console, arguments);
};

Server.prototype.warning = function() {
  return console.error.apply(console, arguments);
};

Server.prototype._handleRequest = function(req, res) {
  return this.app(req, res);
};

Server.prototype.listen = function(port, hostname, func) {
  var self = this;

  this.server.on('request', function(req, res) {
    return self._handleRequest(req, res);
  });
  // this.server.on('request', this.app);

  port = port || this.conf.port || 8080;
  hostname = hostname || this.conf.hostname;

  return this.server.listen(port, hostname, func);
};

/**
 * Redirection
 */

Server.prototype._redirectHost = function(protocol, req, res, next) {
  var conf = this.conf
    , parts = (req.headers['host'] || '').split(':')
    , header = parts[0]
    , port = parts[1] ? ':' + parts[1] : ''
    , path = url.parse(req.url).path
    , cparts = conf.host.split('.')
    , hparts = header.split('.')
    , host;

  // Make sure TLD and SLD matches conf.host.
  // e.g. dilated.cc->dilated.io
  if (conf.host !== hparts.slice(-2).join('.')) {
    host = hparts
      .slice(0, -cparts.length)
      .concat(cparts)
      .join('.');
  }

  // No www subdomain.
  if (hparts[0] === 'www') {
    host = (host || header).substring(4);
  }

  // Use correct protocol (usually https->http).
  // if (protocol === 'https' && !req.secure) {
  if (req.protocol !== protocol) {
    host = host || header;
  }

  if (!host) {
    return next();
  }

  // Maybe used 301 for moved permanently.
  res.writeHead(302, {
    'Location': protocol + '://' + host + port + path
  });

  return res.end();
};

/**
 * "Inherit" Express Methods
 */

/*
// Methods
Object.keys(express.application).forEach(function(key) {
  if (Server.prototype[key]) return;
  Server.prototype[key] = function() {
    return this.app[key].apply(this.app, arguments);
  };
});

// Middleware
Object.getOwnPropertyNames(express).forEach(function(key) {
  var prop = Object.getOwnPropertyDescriptor(express, key);
  if (typeof prop.get !== 'function') return;
  Object.defineProperty(Server, key, prop);
});
*/

/*
// Server Methods
Object.keys(EventEmitter.prototype).forEach(function(key) {
  if (Server.prototype[key]) return;
  Server.prototype[key] = function() {
    return this.server[key].apply(this.server, arguments);
  };
});
*/

/**
 * Liquor Extensions
 */

function load(views, filename) {
  var filename = path.join(views, filename)
    , temp
    , parents = []
    , i;

  temp = fs.readFileSync(filename, 'utf8');
  temp = temp.replace(
    /\s*<!extends? +"([^"]+)">\s*/gi,
    function(__, file) {
      parents.push(file);
      return '';
    }
  );

  i = parents.length;
  while (i--) {
    temp = '\n' + temp.trim() + '\n';
    //temp = load(views, parents[i])
    //  .replace(/\s*__body__\s*/gi, temp);
    temp = load(views, parents[i])
      .replace(/\n*( *)__body__\s*/gi, function(__, sp) {
        if (sp) temp = temp.replace(/^(?!\s*$)/gm, sp);
        return temp;
      });
  }

  return temp.replace(
    /\s*<!include +"([^"]+)">\s*/gi,
    function(__, file) {
      return load(views, file);
    }
  );
}

function compileFile(file, options) {
  var cache = liquor._cache || (liquor._cache = {})
    , views = path.resolve(file, '..')
    , file = path.basename(file);

  if (!cache[file]) {
    cache[file] = liquor(load(views, file), options);
  }

  return cache[file];
}

function renderFile(file, options, callback) {
  return callback(null, compileFile(file, { pretty: true })(options));
}

liquor.renderFile = renderFile;

/**
 * Prototype Extensions
 */

var Response = http.ServerResponse
  , Request = http.ClientRequest
  , Application = express.application;

Response.prototype.show = function(name, opt) {
  var out;
  this.render(name, opt || {}, function(err, str) {
    if (err && !str) throw err;
    out = str;
  });
  return out;
};

Response.prototype.cached = function(tag) {
  if (this.app.settings.env === 'development') {
    return false;
  }

  var cached = typeof tag === 'string'
    ? this.ETag(tag)
    : this.lastModified(tag);

  if (cached) {
    this.statusCode = 304;
    this.end();
    return true;
  }
};

Response.prototype.lastModified = function(last) {
  var since = this.req.headers['if-modified-since'];
  this.setHeader('Last-Modified', last = last.valueOf());
  if (since) since = new Date(+since || since).valueOf();
  return last === since;
};

Response.prototype.ETag = function(etag, weak) {
  var none = this.req.headers['if-none-match'];
  this.setHeader('ETag', (weak ? 'W/' : '') + '"' + etag + '"');
  if (none) none = none.replace(/^W\/|["']/gi, '');
  return etag === none;
};

Response.prototype.error = function(code, body) {
  var res = this
    , req = this.req
    , app = this.app;

  if (res.finished || res._header) {
    return console.error('res.error failed.');
  }

  // remove all headers - hack
  res._headers = {};
  res._headerName = {};

  res.statusCode = code = +code || 500;

  // 204 and 304 should not have a body
  if (code !== 204 && code !== 304 && code > 199) {
    var phrase = code + ': ' + http.STATUS_CODES[code];

    if (app._errorHandler && !res.errorCalled) {
      res.errorCalled = true;
      try {
        app._errorHandler({
          code: code,
          phrase: phrase,
          body: body
        }, req, res);
      } catch (e) {
        console.error(e.stack || e + '');
      }
      if (res.finished) return;
      if (res._header) return;
      //if (res._header) return res.end('Error.');
    }

    if (!body) body = 'An error occured.';
    body = '<!doctype html>\n'
           + '<title>' + code + '</title>\n'
           + '<h1>' + phrase + '</h1>\n'
           + '<pre>' + body + '</pre>';

    res.writeHead(code, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': Buffer.byteLength(body)
    });
  } else {
    body = undefined;
  }

  return res.end(body);
};

Response.prototype.cache = function(val) {
  return this.header('Cache-Control', val);
};

Request.prototype.__defineGetter__('stale', function() {
  var res = this.res;
  var tag = res.header('ETag')
    || +res.header('Last-Modified');
  return tag && this.res.cached(tag);
});

Request.prototype.__defineGetter__('fresh', function() {
  return !this.stale;
});

Response.prototype.local = function(key, val) {
  if (arguments.length === 2) {
    var obj = {};
    obj[key] = val;
    this.locals(obj);
  } else {
    return this.locals[key];
  }
};

Application.error = function(func) {
  this._errorHandler = func;
};

/**
 * Expose
 */

exports = Server;

exports.createServer = Server;
exports.config = config;

module.exports = Server;
