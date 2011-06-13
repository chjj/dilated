var crypto = require('crypto');
var hash = function(str) {
  return crypto.createHash('sha256')
               .update(str).digest('hex');
};

exports.get = function(req, res, next) {
  res.local('title', 'Admin Panel');
  res.render(res.login ? 'admin.html' : 'login.html');
};

exports.logout = function(req, res, next) {
  res.clearCookie('user');
  res.redirect('/admin');
};

exports.login = function(req, res, next) {
  if (res.login) return next(400);
  var password = req.body.password;
  if (!password) {
    return next({code: 403, msg: 'No password.'});
  }
  if (hash(password) !== config.pass) {
    return next({code: 403, msg: 'Bad password.'});
  }
  res.cookie('user', config.pass, {
    maxAge: 30 * 24 * 60 * 60 * 1000, 
    httpOnly: true
  });
  res.redirect('/admin');
};