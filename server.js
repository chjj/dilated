#!/usr/bin/env node

//   ___        ___  __  __  ___
//  /  / / /   /__/  /  /_  /  /
// /__/ / /_  /  /  /  /_  /__/
//

process.title = 'dilated';

var fs = require('fs')
  , path = require('path')
  , http = require('http')
  , fread = fs.readFileSync
  , fwrite = fs.writeFileSync;

/**
 * Settings
 */

var config = require('./config.json');

config.content = config.content.replace(/^\./, __dirname);
config.root = __dirname;

module.config = config;

/**
 * Modules
 */

var express = require('express')
  , app = express()
  , dev = app.settings.env === 'development';

var Post = require('./lib/data').Post
  , handle = require('./lib/handle')
  , utils = require('./lib/utils')
  , csslike = require('csslike');

/**
 * Extra
 */

var liquor = require('liquor');

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

var Response = http.ServerResponse
  , Request = http.ClientRequest
  , Application = app.constructor;

/**
 * Response
 */

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

Application.prototype.error = function(func) {
  this._errorHandler = func;
};

Response.prototype.local = function(key, val) {
  if (arguments.length === 2) {
    var obj = this.locals() || {};
    obj[key] = val;
    this.locals(obj);
  } else {
    return (this.locals() || {})[key];
  }
};

/**
 * Configure
 */

app.set('root', __dirname);
app.set('views', __dirname + '/view');
app.engine('.html', liquor.renderFile);

//app.error(function(err, req, res) {
//  res.render('error.html', {
//    title: err.phrase,
//    message: err.body || err.phrase,
//    back: req.header('referer') || '.'
//  });
//});

/**
 * Middleware
 */

app.configure('development', function() {
  app.use(express.responseTime());
});

app.use(function(req, res, next) {
  req.pathParts = req.path.replace(/^\/+|\/+$/g, '').split('/');
  next();
});

app.configure('production', function() {
  app.use(express.log({
    path: __dirname + '/http.log',
    limit: 5 * 1024 * 1024
  }));
});


app.use(express.favicon(__dirname + '/static/favicon.ico'));
app.use(express.cookieParser());
app.use(express.compress());

app.use(express.bodyParser({
  limit: 100 * 1024
}));

app.use(function(req, res, next) {
  res.login = req.cookies.user === config.pass;
  res.locals({
    rel: undefined,
    login: res.login,
    tags: Post.buildTags(Post.tags.slice(0, 6), req.path[0])
  });
  next();
});

app.use('/liquorice',
  csslike.handle({
    file: __dirname + '/static/style.css',
    dir: __dirname,
    minify: !dev,
    cache: !dev
  })
);

//app.use(utils.pretty.handle);

//app.use(express.router(app));

app.use(express.static(__dirname + '/static'));

/**
 * Routes
 */

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

//app.use(function(err, req, res, next) {
//  res.render('error.html', {
//    title: err.phrase,
//    message: err.body || err.phrase,
//    back: req.header('referer') || '.'
//  });
//});

/**
 * Error Handling
 */

app.configure('production', function() {
  process.on('uncaughtException', function(err) {
    err = err.stack || err + '';
    console.error(new Date().toISOString() + ': ' + err);
  });
});

/**
 * Listen
 */

app.configure('development', function() {
  app.listen(8080);
});

app.configure('production', function() {
  app.listen(80);
});

/**
 * Expose
 */

module.exports = app;
