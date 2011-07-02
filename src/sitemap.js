var Post = require('./post');

module.exports = function(req, res, next) {
  if (res.cached(Post.updated)) return;

  res.contentType('.xml');

  Post.desc(function(err, posts) {
    if (err || !posts) return next(500);
    posts = posts.map(function(post) {
      return {
        loc: config.host + '/' + post.id,
        lastmod: (new Date(post.updated)).toISOString(),
        priority: '0.5'
      };
    });
    posts.push({loc: config.host + '/', priority: '0'});
    res.render('sitemap.xml', { map: posts });
  });
};