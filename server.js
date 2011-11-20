#!/usr/bin/env node

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

var vanilla = require('vanilla')
  , app = vanilla.createServer()
  , dev = app.settings.env === 'development';

var Post = require('./lib/data').Post
  , handle = require('./lib/handle')
  , utils = require('./lib/utils')
  , Pingback = require('pingback')
  , csslike = require('csslike');

/**
 * Configure
 */

app.set('root', __dirname);
app.set('views', __dirname + '/view');
app.set('engine', 'liquor');

app.error(function(err, req, res) {
  res.render('error.html', {
    title: err.phrase,
    message: err.body || err.phrase,
    back: req.header('referer') || '.'
  });
});

/**
 * Middleware
 */

app.configure('development', function() {
  app.use(vanilla.responseTime());
});

app.configure('production', function() {
  app.use(vanilla.log({
    path: __dirname + '/http.log',
    limit: 5 * 1024 * 1024
  }));
});


app.use(vanilla.favicon(__dirname + '/static/favicon.ico'));
app.use(vanilla.cookieParser());
app.use(vanilla.gzip());
app.use(vanilla.bodyParser({limit: 100 * 1024}));

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

app.use(utils.pretty.handle);

app.use(vanilla.router(app));

app.use(vanilla.static(__dirname + '/static'));


/**
 * Routes
 */

app.get('/feed', handle.feed);

app.get('/logout', handle.logout);
app.get('/admin', handle.admin);
app.post('/admin', handle.login);

app.get('browse', handle.year);

app.get('/sitemap.xml', handle.sitemap);

app.get('/', handle.search);

app.get('*', handle.display);

app.post('*', handle.modify);
app.put('*', handle.modify);
app.del('*', handle.modify);


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
module.app = app;
