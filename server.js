var vanilla = require('./deps/vanilla'), 
    app = vanilla.createServer();

// ========== SETTINGS ========== //
app.configure(function() {
  var read = require('fs').readFileSync;
  config = JSON.parse(read(__dirname + '/config.json', 'utf-8'));
  config.content = config.content.replace(/^\./, __dirname);
  config.root = __dirname;
  
  app.set('views', __dirname + '/view');
  //app.set('engine', './liquor'); 
});

// ========== DEVELOPMENT ========== //
app.configure('development', function() {
  app.use(vanilla.responseTime());
  app.stack.unshift(app.stack.pop());
});

// ========== MIDDLEWARE ========== //
app.configure(function() {
  var Post = require('./src/post'),
      Pingback = require('./deps/pingback'),
      prettyHTML = require('./src/utils').prettyHTML,
      STATUS_CODES = require('http').STATUS_CODES;
  
  app.use(vanilla.favicon(__dirname + '/static/favicon.ico'));
  app.use(vanilla.static(__dirname + '/static'));
  app.use(vanilla.cookieParser());
  app.use(vanilla.bodyParser({limit: 100 * 1024}));
  
  // prettify all markup
  app.use(function(req, res, next) {
    var send = res.send;
    res.send = function(data) {
      res.send = send;
      var type = res.header('Content-Type') || '';
      if ((!type || /html|xml/i.test(type)) 
      && typeof data === 'string') {
        arguments[0] = data = prettyHTML(data);
      }
      return send.apply(res, arguments);
    };
    next();
  });
  
  app.use(function(req, res, next) {
    // secure? no. this is temporary, 
    // should probably use sessions
    res.login = req.cookies.user === config.pass;
    res.locals({
      login: res.login,
      path: req.path,
      pathname: req.pathname,
      rel: {},
      tags: Post.buildTags(Post.tags.slice(0, 6), req.path[0]),
      app: app
    });
    next();
  });
  
  app.use('/pingback', Pingback.middleware(
    function(source, target, next) {
      var ping = this, path = target.pathname;
      path = path.replace(/^\/|\/$/g, '')
                 .split('/').pop();
      Post.get(path, function(err, post) {
        if (err) {
          return next(Pingback.TARGET_DOES_NOT_EXIST);
        }
        post.retrieve('pingbacks', function(err, data) {
          if (!data) data = [];
          var i = data.length; 
          while (i--) {
            if (data[i].source === source.href) {
              return next(Pingback.ALREADY_REGISTERED);
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
  
  app.use(vanilla.router(app));
  
  // error handling
  app.use(function(err, req, res, next) {
    if (typeof err === 'number') {
      err = { code: err };
    } else if (!err.code) {
      console.error(err.stack || err + '');
    }
    
    var code = res.statusCode = +err.code || 500;
    if (!STATUS_CODES[code]) code = 500;
    var status = code + ': ' + STATUS_CODES[code];
    
    // clear headers - hack
    res._headers = {};
    res._headerNames = {};
    
    res.render('error.html', { 
      title: status, 
      message: err.msg || status,
      rel: {},
      back: req.header('referer') || '.'
    });
  });
});

// ========== ROUTES ========== //
app.configure(function() {
  var dev = app.settings.env === 'development';
  var admin = require('./src/admin'),
      browse = require('./src/browse'),
      feed = require('./src/feed'),
      style = require('./deps/style'),
      sitemap = require('./src/sitemap'),
      article = require('./src/article');
  
  app.get('/liquorice', style.handle({
    file: __dirname + '/static/style.css',
    dir: __dirname,
    minify: false, // false for now
    cache: !dev
  }));
  
  app.get('/feed', feed);
  
  app.get('/logout', admin.logout);
  app.get('/admin', admin.get);
  app.post('/admin', admin.login);
  
  app.get('browse', browse.year); 
  
  app.get('/sitemap.xml', sitemap);
  
  app.get('/', browse.search);
  
  app.get('*', article.get);
  app.post('*', article.post);
});

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

// log uncaught errors
app.configure('production', function() {
  process.on('uncaughtException', function on(err) {
    err = err.stack || err + '';
    console.error(i + ' - ' + new Date().toISOString() + ': ' + err);
  });
});