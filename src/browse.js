var utils = require('./utils')
  , Post = require('./post');

var render = function(req, res, list) {
  if (!res.local('back')) {
    var prev = req.pathname.replace(/\/[^\/]+\/?$/, '') || '/';
    res.local('back', prev);
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

exports.search = function(req, res, next) {
  var search = req.query.search;

  if (!search) {
    return next();
  }

  if (res.cached(Post.updated)) return;

  if (!search.trim()) {
    return next({code: 404, msg: 'Please enter a search term.'});
  }

  if (search === '/') {
    return res.redirect('/admin');
  }

  res.local('title', 'Search for ' + search);

  Post.search(search, function(err, posts) {
    if (err) {
      return next({code: 404, msg: 'No articles found.'});
    }
    render(req, res, posts);
  });
};

exports.year = function(req, res, next) {
  if (res.cached(Post.updated)) return;

  res.local('rel').browse = true;

  var year = req.path[1];

  if (!year) {
    year = (new Date()).getFullYear();
  }

  if (!/^\d{4}$/.test(year)) {
    return next(404);
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
      return next({code: 404, msg: 'No articles found.'});
    }
    render(req, res, posts);
  });
};
