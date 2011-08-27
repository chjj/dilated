/**
 * Handlers
 */

var utils = require('./utils')
  , Post = require('./data').Post
  , path = require('path');

var config = module.parent.config;

/**
 * List
 */

var list = function(req, res, list) {
  if (!res.local('back')) {
    res.local('back', path.resolve(req.pathname, '..'));
  }
  res.local('list', list.map(function(item) {
    return {
      href: '/' + item.id,
      text: item.title,
      datetime: new Date(item.timestamp).toISOString(),
      time: utils.prettyTime(item.timestamp)
    };
  }));
  res.render('browse.html');
};

/**
 * Search Posts
 */

list.search = function(req, res, next) {
  var search = req.query.search;

  if (!search) {
    return next();
  }

  if (res.cached(Post.updated)) return;

  if (!search.trim()) {
    return res.error(404, 
      'Please enter a search term.');
  }

  if (search === '/') {
    return res.redirect('/admin');
  }

  res.local('title', 'Search for ' + search);

  Post.search(search, function(err, posts) {
    if (err) {
      return res.error(404, 
        'No articles found.');
    }
    list(req, res, posts);
  });
};

exports.search = list.search;

/**
 * Browse Posts by Year
 */

list.year = function(req, res, next) {
  if (res.cached(Post.updated)) return;

  res.local('rel', 'browse');

  var year = req.path[1];

  if (!year) {
    year = (new Date()).getFullYear();
  }

  if (!/^\d{4}$/.test(year)) {
    return res.error(404);
  }

  year = +year;

  res.local('title', 'Browse: ' + year);
  res.local('back', '/browse/' + (year - 1));

  year = {
    start: new Date(year, 0, 1).getTime(),
    end: new Date(year, 11, 31).getTime()
  };

  Post.range(year, function(err, posts) {
    if (err) {
      return res.error(404, 'No articles found.');
    }
    list(req, res, posts);
  });
};

exports.year = list.year;

/**
 * Get Post
 */

var get = function(req, res, params, func) {
  if (params.slug) {
    Post.get(params.slug, done, params.tag);
  } else {
    Post.getLast(params.tag, done);
  }

  function done(err, post) {
    if (err) {
      return err.code === 'ENOENT' 
        ? req.next() 
        : req.next(err);
    }
    func(post);
  }
};

// parse path parameters
get.extract = function(path) {
  var param = {}
    , i = 0;

  if (path[0] === 'post' && !path[1]) {
    param.action = 'post';
    return param;
  }

  if (~Post.tags.indexOf(path[i])) {
    param.tag = path[i++];
  }

  if (path[i]) {
    param.slug = path[i++];
  }

  if (display[path[i]]
      && path[i] !== 'post'
      && path[i] !== 'view') {
    param.action = path[i++];
  } else {
    param.action = 'view';
    if (path[i]) {
      param.asset = path[i++];
    }
  }

  return param;
};

/**
 * Display a Post
 */

var display = function(req, res, next) {
  var params = get.extract(req.path);

  if (params.asset) {
    var path = Post.getAssetPath(
      params.slug,
      params.asset
    );
    return res.sendfile(path, function() {
      res.error(404);
    });
  }

  if (!~display.actions.indexOf(params.action)) {
    return res.error(400);
  }

  var handler = display[params.action];

  if (handler.length === 3) {
    return handler(req, res, params);
  }

  get(req, res, params, function(post) {
    if (res.cached(Post.updated)) return;
    handler(req, res, params, post);
  });
};

display.actions = [
  'post',
  'edit',
  'delete',
  'view'
];

display.post = function(req, res, params) {
  if (!res.login) {
    return res.error(403);
  }

  res.render('form.html', {
    title: 'Post Article',
    post: {
      timestamp: new Date().toISOString()
    },
    form: {
      name: 'Post Article',
      slug: true,
      action: req.url
    }
  });
};

display.edit = function(req, res, params, post) {
  if (!res.login) {
    return res.error(403);
  }

  post.merge({
    title: post.title 
      && utils.escapeHTML(post.title),
    tags: post.tags 
      && post.tags.join(', '),
    timestamp: new Date(post.timestamp).toISOString(),
    content: utils.escapeHTML(post.content)
      .replace(/\r?\n/g, '&#x0A;')
  });

  res.render('form.html', {
    title: 'Edit Post',
    post: post,
    form: {
      name: 'Edit Post',
      action: req.url
    }
  });
};

display.delete = function(req, res, params, post) {
  if (!res.login) {
    return res.error(403);
  }
  res.render('confirm.html', {
    title: 'Delete Post',
    id: post.id || params.slug + '/' + params.action
  });
};

display.view = function(req, res, params, post) {
  res.header('X-Pingback', 
    'http://' + config.host + '/pingback');

  if (req.pathname === '/') {
    res.local('rel', 'home');
  }

  res.render('post.html', {
    title: post.title,
    canonical: (!params.slug || params.tag) 
      ? '/' + post.id 
      : false,
    post: {
      title: post.title,
      permalink: '/' + post.id,
      datetime: new Date(post.timestamp).toISOString(),
      timestamp: utils.prettyTime(post.timestamp),
      content: utils.markdown(post.content),
      tags: Post.buildTags(
        post.tags,
        params.tag
      ),
      prev: post.previous && {
        href: '/' 
          + (params.tag 
             ? params.tag + '/' 
             : '') 
          + post.previous.id,
        title: post.previous.title
      },
      next: post.next && {
        href: '/' 
          + (params.tag 
             ? params.tag + '/' 
             : '') 
          + post.next.id,
        title: post.next.title
      },
      edit: res.login 
        && '/' + post.id + '/edit'
    }
  });
};

exports.display = display;

/**
 * Handle Post Modification
 */

var modify = function(req, res) {
  if (!res.login) {
    return res.error(403);
  }

  var params = get.extract(req.path);

  if (!~modify.actions.indexOf(params.action)) {
    return res.error(400);
  }

  var handler = modify[params.action];

  if (handler.length === 2) {
    return handler(req, res);
  }

  get(req, res, params, function(post) {
    handler(req, res, post);
  });
};

modify.actions = [
  'post',
  'edit',
  'delete'
];

modify.post = function(req, res) {
  modify.edit(req, res, new Post());
};

modify.edit = function(req, res, post) {
  var data = req.body
    , id = post.id || data.slug;

  id = id || data.title
    .replace(/\s+/g, '-')
    .toLowerCase();

  post.merge({
    title: data.title,
    content: data.content,
    id: id,
    tags: data.tags 
      && data.tags.split(/\s*,\s*/),
    timestamp: data.timestamp 
      && Date.parse(data.timestamp)
  });

  post.update(function() {
    res.redirect(id || '/');
  });
};

modify.delete = function(req, res, post) {
  post.remove(function() {
    res.redirect('/');
  });
};

exports.modify = modify;

/**
 * Sitemap
 */

exports.sitemap = function(req, res, next) {
  if (res.cached(Post.updated)) return;

  var posts = [];

  res.contentType('.xml');

  Post.desc(function(post) {
    posts.push({
      loc: config.host + '/' + post.id,
      lastmod: new Date(post.updated).toISOString(),
      priority: '0.5'
    });
  }, function() {
    posts.push({
      loc: config.host + '/', 
      priority: '0'
    });
    res.render('sitemap.xml', { 
      map: posts 
    });
  });
};

/**
 * Feed
 */

/**
 * Atom Feed
 */

exports.feed = (function() {
  var updated
    , cache;

  var tag = function(host, year, id) {
    return 'tag:' 
      + host + ',' 
      + year + ':' 
      + id;
  };

  var build = function(req, res, posts) {
    posts = posts.map(function(post) {
      var timestamp = new Date(post.timestamp)
        , update = new Date(post.updated).toISOString();

      return {
        title: utils.escapeHTML(post.title),
        href: '/' + post.id,
        id: tag(config.host, timestamp.getFullYear(), post.id),
        published: timestamp.toISOString(),
        updated: update,
        content: utils.markdown(post.content)
          // there are a few changes that need to occur within
          // the algorithm for converting an html(5) document to
          // an atom feed, change h[x] to h[x-1] to fix the outline
          .replace(/(<\/?h)([2-6])([^>]*>)/gi, function($0, $1, $2, $3) {
            return $1 + (--$2) + $3;
          })
      };
    });

    res.locals({
      host: config.host,
      self: '/feed',
      updated: posts[0].updated,
      alternate: '/',
      id: tag(config.host, 2010, 'index'),
      entries: posts
    });

    // this file may get accessed more than
    // any other due to all the bots and feed
    // readers requesting it. it's reasonable
    // to cache the entire thing in a buffer
    // and hold it in memory.
    cache = new Buffer(res.show('feed.xml'));
    updated = Date.now();

    res.send(cache);
  };

  return function(req, res, next) {
    if (res.cached(Post.updated)) return;
    res.contentType('.atom');

    if (cache && updated >= Post.updated) {
      return res.send(cache);
    }

    Post.getLatest(10, function(err, posts) {
      if (err) return next(404);
      var pending = posts.length;
      posts.forEach(function(post, i) {
        Post.get(post.id, function(err, post) {
          if (!err) posts[i] = post;
          --pending || build(req, res, posts);
        });
      });
    });
  };
})();


/**
 * Admin Panel
 */

exports.admin = function(req, res, next) {
  res.local('title', 'Admin Panel');
  res.render(res.login 
    ? 'admin.html' 
    : 'login.html');
};

exports.logout = function(req, res, next) {
  res.clearCookie('user');
  res.redirect('/admin');
};

exports.login = function(req, res, next) {
  if (res.login) return res.error(400);

  var password = req.body.password;
  if (!password) {
    return res.error(403, 'No password.');
  }

  if (utils.hash(password) !== config.pass) {
    return res.error(403, 'Bad password.');
  }

  res.cookie('user', config.pass, {
    maxAge: 30 * 24 * 60 * 60 * 1000,
    httpOnly: true
  });
  res.redirect('/admin');
};
