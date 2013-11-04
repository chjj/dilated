/**
 * dilated: data.js
 * Copyright (c) 2011-2013, Christopher Jeffrey (MIT License)
 */

/**
 * Handlers
 */

module.exports = function(server) {
  var module = { exports: {} };
  var exports = module.exports;

  var utils = require('./utils')
    , Post = server.modules.data.Post
    , path = require('path');

  var config = server.conf;

  /**
   * List
   */

  var list = function(req, res, list) {
    if (!res.local('back')) {
      res.local('back', path.resolve(req.path, '..'));
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

    if (search == null) {
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

    var year = req.pathParts[1];

    if (!year) {
      return Post.getLast(function(err, post) {
        if (err) return next(err);
        year = (new Date(post.timestamp)).getFullYear();
        return done();
      });
    } else {
      if (!/^\d{4}$/.test(year)) {
        return res.error(404);
      }

      year = +year;

      return done();
    }

    function done() {
      res.local('title', 'Browse: ' + year);
      res.local('back', '/browse/' + (year - 1));

      year = {
        start: new Date(year, 0, 1).getTime(),
        end: new Date(year, 11, 31).getTime()
      };

      return Post.range(year, function(err, posts) {
        if (err) {
          //return res.error(404, 'No articles found.');
          res.statusCode = 404;
          return res.render('error.html', {
            message: 'No articles found.'
          });
        }
        return list(req, res, posts);
      });
    }
  };

  exports.year = list.year;

  /**
   * Get Post
   */

  var get = function(req, res, params, callback) {
    if (params.slug) {
      Post.get(params.slug, done, params.tag);
    } else {
      Post.getLast(params.tag, done);
    }

    function done(err, post) {
      if (err) {
        return req.next();
        //return err.code === 'ENOENT'
        //  ? req.next()
        //  : req.next(err);
      }
      return callback(post);
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

  function display(req, res, next) {
    var params = get.extract(req.pathParts);

    if (params.asset) {
      var path = Post.getAssetPath(
        params.slug,
        params.asset
      );
      return res.sendfile(path, function() {
        return next();
      });
    }

    if (!~display.actions.indexOf(params.action)) {
      return res.error(400);
    }

    var handler = display[params.action];

    if (handler.length === 3) {
      return handler(req, res, params);
    }

    return get(req, res, params, function(post) {
      if (res.cached(Post.updated)) return;
      return handler(req, res, params, post);
    });
  }

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

    return res.render('form.html', {
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

    return res.render('form.html', {
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
    return res.render('confirm.html', {
      title: 'Delete Post',
      id: post.id || params.slug + '/' + params.action
    });
  };

  display.view = function(req, res, params, post) {
    if (req.path === '/') {
      res.local('rel', 'home');
    }

    return res.render('post.html', {
      title: post.title,
      canonical: !params.slug || params.tag
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
        previous: post.previous && {
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

  function modify(req, res) {
    if (!res.login) {
      return res.error(403);
    }

    var params = get.extract(req.pathParts);

    if (!~modify.actions.indexOf(params.action)) {
      return res.error(400);
    }

    var handler = modify[params.action];

    if (handler.length === 2) {
      return handler(req, res);
    }

    return get(req, res, params, function(post) {
      return handler(req, res, post);
    });
  };

  modify.actions = [
    'post',
    'edit',
    'delete'
  ];

  modify.post = function(req, res) {
    return modify.edit(req, res, new Post());
  };

  modify.edit = function(req, res, post) {
    var data = req.body
      , id = post.id || data.slug;

    id = id || data.title
      .replace(/\s+/g, '-')
      .toLowerCase();

    post.merge({
      id: id,
      title: data.title,
      content: data.content,
      tags: data.tags
        && data.tags.split(/\s*,\s*/),
      timestamp: data.timestamp
        && Date.parse(data.timestamp)
    });

    return post.update(function() {
      return res.redirect(id || '/');
    });
  };

  modify.delete = function(req, res, post) {
    return post.remove(function() {
      return res.redirect('/');
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

    return Post.desc(function(post) {
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
      return res.render('sitemap.xml', {
        map: posts
      });
    });
  };

  /**
   * Feed
   */

  exports.feed = (function() {
    var updated
      , cache;

    function tag(host, year, id) {
      return 'tag:'
        + host + ','
        + year + ':'
        + id;
    }

    function build(req, res, posts) {
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

      return res.send(cache);
    }

    return function(req, res, next) {
      if (res.cached(Post.updated)) return;
      res.contentType('.atom');

      if (cache && updated >= Post.updated) {
        return res.send(cache);
      }

      Post.getLatest(10, function(err, posts) {
        if (err) return next(404);
        return utils.forEach(posts, function(post, next, i) {
          return Post.get(post.id, function(err, post) {
            if (!err) posts[i] = post;
            return next();
          });
        }, function() {
          return build(req, res, posts);
        });
        //var pending = posts.length;
        //posts.forEach(function(post, i) {
        //  Post.get(post.id, function(err, post) {
        //    if (!err) posts[i] = post;
        //    if (!--pending) build(req, res, posts);
        //  });
        //});
      });
    };
  })();

  /**
   * Admin Panel
   */

  exports.admin = function(req, res, next) {
    res.local('title', 'Admin Panel');
    return res.render(res.login ? 'admin.html' : 'login.html');
  };

  exports.logout = function(req, res, next) {
    res.clearCookie('user');
    return res.redirect('/admin');
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

    return res.redirect('/admin');
  };

  return module.exports;
};
