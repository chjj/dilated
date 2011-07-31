#!/usr/bin/env node

var vanilla = require('vanilla')
  , app = vanilla.createServer()
  , dev = app.settings.env === 'development';

var fs = require('fs')
  , fread = fs.readFileSync
  , fwrite = fs.writeFileSync;

/**
 * Settings
 */

app.configure(function() {
  config = JSON.parse(fread(__dirname + '/config.json', 'utf8'));
  config.content = config.content.replace(/^\./, __dirname);
  config.root = __dirname;

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

app.configure(function() {
  var pingback = require('pingback')
    , csslike = require('csslike')
    , Post = require('./src/post')
    , prettyHTML = require('./src/utils').prettyHTML
    , codes = require('http').STATUS_CODES;

  app.use(vanilla.favicon(__dirname + '/static/favicon.ico'));
  app.use(vanilla.static(__dirname + '/static'));
  app.use(vanilla.cookieParser());
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

  app.use('/pingback', pingback.middleware(
    function(source, target, next) {
      var ping = this
        , path = target.pathname;

      path = path.replace(/^\/|\/$/g, '')
                 .split('/').pop();

      Post.get(path, function(err, post) {
        if (err) {
          return next(pingback.TARGET_DOES_NOT_EXIST);
        }
        post.retrieve('pingbacks', function(err, data) {
          if (!data) data = [];
          var i = data.length;
          while (i--) {
            if (data[i].source === source.href) {
              return next(pingback.ALREADY_REGISTERED);
            }
          }
          data.push({
            source: source.href,
            title: ping.title,
            excerpt: excerpt.title
          });
          post.store('pingbacks', data);
          next();
        });
      });
    }
  ));

  app.use('/liquorice', 
    csslike.handle({
      file: __dirname + '/static/style.css',
      dir: __dirname,
      minify: !dev,
      cache: !dev
    })
  );

  app.use(vanilla.router(app));
});

/**
 * Routes
 */

app.configure(function() {
  var handle = require('./src/handle');

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
});

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

if (!module.parent) {
  app.configure('development', function() {
    app.listen(8080);
  });
  app.configure('production', function() {
    app.listen(80);
  });
} else {
  module.exports = app;
}

/**
 * Expose PID
 */

fwrite(__dirname + '/.pid', process.pid + '');