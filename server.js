#!/usr/bin/env node

//   ___        ___  __  __  ___
//  /  / / /   /__/  /  /_  /  /
// /__/ / /_  /  /  /  /_  /__/
//

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

var data = require('./lib/data')
  , handle = require('./lib/handle')
  , utils = require('./lib/utils');

var argv;

/**
 * Server
 */

function Server(options) {
  if (!(this instanceof Server)) {
    return new Server(options);
  }

  var self = this
    , conf;

  this.argv = argv;

  try {
    this.conf = conf = require(argv.config || __dirname + '/config.json');
  } catch (e) {
    this.conf = conf = {};
  }

  conf.root = __dirname;
  conf.content = expand(conf.content);
  conf.log = expand(conf.log);

  if (conf.https && conf.https.enabled === false) {
    delete conf.https;
  }

  if (conf.https) {
    conf.https.cert = tryRead(conf.https.cert, null) || conf.https.cert;
    conf.https.key = tryRead(conf.https.key, null) || conf.https.key;
    conf.https.ca = tryRead(conf.https.ca, null) || conf.https.ca;
  }

  Object.keys(options || {}).forEach(function(key) {
    if (conf[key] === undefined) {
      conf[key] = options[key];
    }
  });

  Object.keys(argv.conf).forEach(function(key) {
    conf[key] = argv.conf[key];
  });

  this.app = express();

  if (conf.env) {
    this.app.set('env', conf.env);
  }

  this.server = conf.https && conf.https.key
    ? require('https').createServer(conf.https)
    : require('http').createServer();

  this.server.on('request', this.app);

  this.on('listening', function() {
    self.log('Listening on port \x1b[1m%s\x1b[m.', conf.port);
  });

  this.init();
}

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

    if (conf.https && conf.https.redir) {
      http.createSever(function(req, res) {
        var host = (req.headers['Host'] || '').split(':')[0]
          , path = url.parse(req.url).path;

        // Maybe used 301 for moved permanently.
        res.writeHead(302, {
          'Location': 'https://' + host + path
        });

        res.end();
      }).listen(80);
    }
  });

  app.set('root', __dirname);
  app.set('views', __dirname + '/view');
  app.engine('.html', liquor.renderFile);
};

/**
 * Middleware
 */

Server.prototype.initMiddleware = function() {
  var self = this
    , app = this.app;

  app.configure('development', function() {
    app.use(express.responseTime());
  });

  app.use(function(req, res, next) {
    req.pathParts = req.path.replace(/^\/+|\/+$/g, '').split('/');
    next();
  });

  if (this.conf.log) {
    app.use(express.logger({
      stream: fs.createWriteStream(this.conf.log)
    }));
  }

  app.use(express.favicon(__dirname + '/static/favicon.ico'));
  app.use(express.cookieParser());
  app.use(express.compress());

  app.use(express.bodyParser({
    limit: 100 * 1024
  }));

  var Post = this.modules.data.Post;

  app.use(function(req, res, next) {
    res.login = req.cookies.user === self.conf.pass;
    res.locals({
      rel: undefined,
      login: res.login,
      tags: Post.buildTags(Post.tags.slice(0, 6), req.pathParts[0])
    });
    next();
  });

  app.use('/liquorice',
    csslike.handle({
      file: __dirname + '/static/style.css',
      dir: __dirname,
      minify: app.settings.env !== 'development',
      cache: app.settings.env !== 'development'
    })
  );

  //app.use(utils.pretty.handle);

  app.use(app.router);

  app.use(express.static(__dirname + '/static'));

  //app.error(function(err, req, res) {
  app.use(function(err, req, res, next) {
    res.render('error.html', {
      title: err.phrase,
      message: err.body || err.phrase,
      back: req.header('referer') || '.'
    });
    next();
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
  var self = this;

  var handle = this.modules.handle;
  var app = this.app;

  app.get('/feed', handle.feed);

  app.get('/logout', handle.logout);
  app.get('/admin', handle.admin);
  app.post('/admin', handle.login);

  app.get('/browse', handle.year);

  app.get('/sitemap.xml', handle.sitemap);

  app.get('/', handle.search);

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

Server.prototype.listen = function(port, hostname, func) {
  port = port || this.conf.port || 8080;
  hostname = hostname || this.conf.hostname;
  return this.server.listen(port, hostname, func);
};

/**
 * "Inherit" Express Methods
 */

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

// Server Methods
Object.keys(EventEmitter.prototype).forEach(function(key) {
  if (Server.prototype[key]) return;
  Server.prototype[key] = function() {
    return this.server[key].apply(this.server, arguments);
  };
});

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

Response.prototype.cached = function(tag) {
  if (this.app.settings.env === 'development') return false;

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

    if (app._errorHandler
        && !res.errorCalled) {
      res.errorCalled = true;
      try {
        app._errorHandler({
          code: code,
          phrase: phrase,
          body: body
        }, req, res);
      } catch(e) {
        console.error(e.stack || e + '');
      }
      if (res.finished) return;
      if (res._header) return res.end('Error.');
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

  res.end(body);
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
    var obj = this.locals() || {};
    obj[key] = val;
    this.locals(obj);
  } else {
    return (this.locals() || {})[key];
  }
};

Application.error = function(func) {
  this._errorHandler = func;
};

/**
 * Helpers
 */

function expand(file) {
  if (typeof file !== 'string') return file;
  file = file.replace(/^~\//, process.env.HOME + '/');
  file = file.replace(/^\.\//, __dirname + '/');
  return file;
}

function tryRead(file, enc) {
  file = expand(file);
  try {
    if (!enc && arguments.length === 2) {
      return fs.readFileSync(file);
    } else {
      return fs.readFileSync(file, enc || 'utf8');
    }
  } catch (e) {
    return '';
  }
}

/**
 * Parse Arguments
 */

function parseArg() {
  var argv = process.argv.slice()
    , opt = { conf: {} }
    , arg;

  function getarg() {
    var arg = argv.shift();

    if (arg.indexOf('--') === 0) {
      // e.g. --opt
      arg = arg.split('=');
      if (arg.length > 1) {
        // e.g. --opt=val
        argv.unshift(arg.slice(1).join('='));
      }
      arg = arg[0];
    } else if (arg[0] === '-') {
      if (arg.length > 2) {
        // e.g. -abc
        argv = arg.substring(1).split('').map(function(ch) {
          return '-' + ch;
        }).concat(argv);
        arg = argv.shift();
      } else {
        // e.g. -a
      }
    } else {
      // e.g. foo
    }

    return arg;
  }

  while (argv.length) {
    arg = getarg();
    switch (arg) {
      case '-p':
      case '--port':
        opt.conf.port = +argv.shift();
        break;
      case '-c':
      case '--config':
        opt.config = argv.shift();
        break;
      case '--path':
        break;
      case '-h':
      case '--help':
        //help();
        break;
      case 'production':
      case '--production':
      case '-d':
      case '--daemonize':
        //daemonize();
        break;
      case '-k':
      case '--kill':
        //killall();
        break;
      default:
        break;
    }
  }

  return opt;
}

argv = parseArg();

/**
 * Listen
 */

if (!module.parent) {
  process.title = 'dilated';

  var app = new Server({
    port: 8080,
    log: __dirname + '/http.log'
  });

  app.listen();
}

/**
 * Expose
 */

module.exports = Server;
