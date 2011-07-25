/**
 * Atom Feed
 */

var utils = require('./utils')
  , Post = require('./post');

var cache
  , updated;

var tag = function(host, year, id) {
  return 'tag:' 
    + host + ',' 
    + year + ':' 
    + id;
};

/**
 * Handler
 */

module.exports = function(req, res, next) {
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

/**
 * Feed Compiler
 */

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
        .replace(/(<\/?h)([2-6])(?=[^>]*>)/gi, function($0, $1, $2) {
          return $1 + ($2 - 1);
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