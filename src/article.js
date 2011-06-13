var utils = require('./utils');
var Post = require('./post');

var escapeHTML = utils.escapeHTML,
    prettyTime = utils.prettyTime,
    markdown = utils.showdown;

// parse the path to extract parameters
var getParams = function(path) {
  path = path.slice();
  var action = (function() {
    // need a 404 here
    var k = path[path.length-1];
    if ($GET[k]) {
      return path.pop();
    }
    return 'view';
  })();
  var tag = (function() {
    if (~Post.tags.indexOf(path[0])) {
      return path.shift();
    }
  })();
  var slug = (function() {
    if (path[0]) return path.shift();
  })();
  var asset = (function() {
    if (path.length > 0 && action === 'view') {
      return path.shift();
    }
  })();
  return { 
    action: action, tag: tag, 
    slug: slug, asset: asset 
  };
};

// get the target post
var getTargetPost = function(req, res, params, func) {
  if (params.slug) {
    Post.get(params.slug, done, params.tag);
  } else {
    Post.getLast(done, params.tag);
  }
  function done(err, post) {
    if (err) {
      return req.next(404); 
    }
    func(post);
  }
};

// handle a change to a post
// post, edit, delete, etc
var updatePost = function(req, res, post) {
  var data = req.body,
      id = post.id || data.slug;
  if (!id) {
    id = data.title.replace(/\s+/g, '-').toLowerCase();
  }
  post.merge({
    title: data.title,
    content: data.content,
    id: id,
    tags: data.tags && data.tags.split(/\s*,\s*/),
    timestamp: data.timestamp && Date.parse(data.timestamp) 
  });
  post.update(function() {
    res.redirect(id || '/');
  });
};

// actions for a GET request
var $GET = {
  'post': function(req, res, params) {
    if (!res.login) {
      return req.next(403);
    }
    res.render('form.html', {
      title: 'Post Article',
      post: {
        timestamp: (new Date()).toISOString()
      },
      form: {
        name: 'Post Article',
        slug: true,
        action: req.url
      }
    }); 
  },
  'edit': function(req, res, params, post) {
    if (!res.login) {
      return req.next(403);
    }
    post.merge({
      title: post.title && escapeHTML(post.title),
      tags: post.tags && post.tags.join(', '),
      timestamp: (new Date(post.timestamp)).toISOString(),
      content: escapeHTML(post.content).replace(/\r?\n/g, '&#x0A;')
    });
    res.render('form.html', {
      title: 'Edit Post',
      post: post,
      form: { 
        name: 'Edit Post',
        action: req.url
      }
    });
  },
  'delete': function(req, res, params, post) {
    if (!res.login) {
      return req.next(403);
    }
    res.render('confirm.html', {
      title: 'Delete Post',
      id: post.id || params.slug + '/' + params.action
    });
  },
  'view': function(req, res, params, post) {
    res.header('X-Pingback', 'http://' + config.host + '/pingback');
    if (req.pathname === '/') {
      res.local('rel').home = true;
    }
    res.render('post.html', {
      title: post.title,
      canonical: (!params.slug || params.tag) ? '/' + post.id : false,
      post: {
        title: post.title,
        permalink: '/' + post.id, 
        datetime: (new Date(post.timestamp)).toISOString(), 
        timestamp: prettyTime(post.timestamp), 
        content: markdown(post.content),
        tags: Post.buildTags(post.tags, params.tag),
        prev: post.previous && {
          href: '/' + (params.tag ? params.tag + '/' : '') + post.previous.id,
          title: post.previous.title
        },
        next: post.next && {
          href: '/' + (params.tag ? params.tag + '/' : '') + post.next.id,
          title: post.next.title
        },
        edit: res.login && '/' + post.id + '/edit'
      }
    });
  }
};

// actions for a POST
var $POST = {
  'post': function(req, res) {
    updatePost(req, res, new Post());
  },
  'edit': function(req, res, post) {
    updatePost(req, res, post);
  },
  'delete': function(req, res, post) {
    post.remove(function() {
      res.redirect('/');
    });
  }
};

// handle a get request
exports.get = function(req, res, next) {
  var params = getParams(req.path);
  
  if (params.asset) {
    var path = Post.getAssetPath(params.slug, params.asset);
    return res.sendfile(path, function() {
      next(404);
    });
  }
  
  var handler = $GET[params.action];
  
  if (!handler) {
    return next(400);
  }
  
  if (handler.length === 3) {
    return handler(req, res, params);
  }
  
  getTargetPost(req, res, params, function(post) {
    if (res.cached(Post.updated)) return;
    handler(req, res, params, post);
  });
};

// handle a post request
exports.post = function(req, res) {
  if (!res.login) {
    return next(403);
  }
  
  var params = getParams(req.path);
  
  var handler = $POST[params.action];
  
  if (!handler) {
    return next(400);
  }
  
  if (handler.length === 2) {
    return handler(req, res);
  }
  
  getTargetPost(req, res, params, function(post) {
    handler(req, res, post);
  });
};
