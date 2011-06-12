var utils = require('./utils');
var Post = require('./post');

var toList = function(items) {
  return items.map(function(item) {
    return {
      href: '/' + item.id,
      text: item.title,
      datetime: (new Date(item.timestamp)).toISOString(), 
      time: utils.prettyTime(item.timestamp) 
    };
  });
};

var renderList = function(res, list) {
  if (!res.local('back')) {
    var prev = res.req.pathname.replace(/\/[^\/]+\/?$/, '') || '/';
    res.local('back', prev);
  }
  res.local('list', list);
  res.render('browse.html');
};

exports.search = function(req, res, next) {
  if (!req.query.search) {
    return next();
  }
  
  if (res.cached(Post.updated)) return;
  
  if (!req.query.search.trim()) {
    return next({code: 404, msg: 'Please enter a search term.'});
  }
  
  if (req.query.search === '/') {
    return res.redirect('/admin');
  }
  
  res.local('title', 'Search for ' + req.query.search);
  
  Post.search(req.query.search, function(err, posts) {
    if (err || !posts.length) {
      return next({code: 404, msg: 'No articles found.'});
    }
    renderList(res, toList(posts));
  });
};

var yearRange = function(year) {
  var start = new Date(year, 0, 1).getTime(),
      end = new Date(year, 11, 31).getTime(); 
  return { start: start, end: end };
};

exports.year = function(req, res, next) {
  if (res.cached(Post.updated)) return;
  
  var year = +req.path[1];
  
  res.local('rel').browse = true;
  
  if (!/^\d{4}$/.test(year)) {
    year = (new Date()).getFullYear();
  }
  
  res.local('title', 'Browse: ' + year);
  res.local('back', '/browse/' + (year - 1));
  
  year = yearRange(year);
  
  Post.range(year, function(err, posts) {
    if (err || !posts || !posts.length) {
      return next({code: 404, msg: 'No articles found.'});
    }
    renderList(res, toList(posts));
  });
};
