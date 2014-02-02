/**
 * dilated: utils.js
 * Copyright (c) 2011-2014, Christopher Jeffrey (MIT License)
 */

/**
 * Utilities
 */

var crypto = require('crypto');

exports.hash = function(str) {
  return crypto
    .createHash('sha256')
    .update(str)
    .digest('hex');
};

exports.escapeHTML = function(html, once) {
  return (html || '')
    .replace(once ? /&(?![^\s;]+;)/g : /&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
};

/**
 * Time Functions
 */

exports.date = function(date) {
  if (!date.getUTCFullYear) {
    date = new Date(date);
  }

  date = date
    .toLocaleDateString()
    .split(/,\s+|\s+/);

  date = {
    day: date[0],
    month: date[1],
    date: date[2],
    year: date[3]
  };

  return date.month
    + ' ' + date.date
    + ', ' + date.year;
};

exports.time = function(date) {
  if (!date.getUTCFullYear) {
    date = new Date(date);
  }

  var hours = +date.getHours()
    , minutes = date.getMinutes().toString()
    , meridiem = hours < 12 ? 'am' : 'pm';

  if (hours === 0) hours = 12;
  if (hours > 12) hours -= 12;
  if (minutes.length < 2) minutes = '0' + '' + minutes;
  return hours + ':' + minutes + ' ' + meridiem;
};

exports.datetime = function(date) {
  return exports.date(date)
    + ' ' + exports.time(date);
};

exports.prettyTime = function(time) {
  var date = time.getUTCFullYear ? time : new Date(time)
    , sec = Math.floor(new Date(Date.now() - date) / 1000)
    , days = Math.floor(sec / 86400);

  if (days === 0) {
    if (sec <= 1) {
      return '1 second ago';
    }
    if (sec < 60) {
      return sec + ' seconds ago';
    }
    if (sec < 120) {
      return '1 minute ago';
    }
    if (sec < 3600) {
      return Math.floor(sec / 60)
             + ' minutes ago';
    }
    if (sec < 7200) {
      return '1 hour ago';
    }
    return Math.floor(sec / 3600)
           + ' hours ago';
  }

  if (days < 31) {
    if (days === 1) {
      return 'Yesterday';
    }
    if (days < 14) {
      return days + ' days ago';
    }
    return Math.floor(days / 7)
           + ' weeks ago';
  }

  if (days >= 31) {
    var months = Math.floor(days / 31);
    if (months === 1) {
      return '1 month ago';
    }
    if (months >= 12) {
      var years = Math.floor(months / 12);
      if (years === 1) {
        return '1 year ago';
      }
      return years + ' years ago';
    }
    return months + ' months ago';
  }
};

/**
 * Markdown
 */

exports.markdown = (function() {
  var marked = require('marked');
  return function(text) {
    return marked(text);
  };
})();

/**
 * Async
 */

exports.forEach = function(obj, iter, done) {
  var pending = obj.length
    , err;

  function next(e) {
    if (e) err = e;
    if (!--pending) done(err);
  }

  return obj.forEach(function(item, i) {
    return iter(item, next, i);
  });
};

exports.forEachSeries = function(obj, iter, done) {
  var i = 0;
  (function next(err) {
    if (err) return done(err);
    var item = obj[i++];
    if (!item) return done();
    return iter(item, next, i - 1);
  })();
};
