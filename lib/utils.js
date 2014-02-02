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
 * Pretty print HTML
 */

exports.pretty = (function() {
  var indent = function(num) {
    return Array(num + 1).join('  ');
  };

  var closing = {
    base: true,
    link: true,
    meta: true,
    hr: true,
    br: true,
    wbr: true,
    img: true,
    embed: true,
    param: true,
    source: true,
    track: true,
    area: true,
    col: true,
    input: true,
    keygen: true,
    command: true
  };

  var remove = /<(pre|textarea|title|p|li|a)(?:\s[^>]+)?>[\s\S]+?<\/\1>/g
    , replace = /<!(\d+)%*\/>/g
    , wrap = /([ \t]*)<p>([\s\S]+?)<\/p>/g;

  return function(str) {
    var hash = []
      , out = []
      , cap
      , depth = 0
      , text
      , full
      , tag
      , name;

    // temporarily remove elements before
    // processing, also remove whitespace
    str = str.replace(remove, function(element, name) {
      if (name === 'pre' || name === 'textarea') {
        element = element.replace(/\r?\n/g, '&#x0A;');
      } else {
        element = element
          .replace(/(<[^\/][^>]*>)\s+|\s+(<\/)/g, '$1$2')
          .replace(/[\r\n]/g, '');
      }
      return '<!' + (hash.push(element) - 1)
                  + (Array(element.length - 3).join('%')) + '/>';
    });

    // indent elements
    str = str
      .replace(/(>)\s+|\s+(<)/g, '$1$2')
      .replace(/[\r\n]/g, '');

    while (cap = /^([^\0]*?)(<([^>]+)>)/.exec(str)) {
      str = str.substring(cap[0].length);
      text = cap[1];
      full = cap[2];
      tag = cap[3];
      name = tag.split(' ')[0];

      if (text) {
        out.push(indent(depth) + text);
      }

      if (name[0] !== '/') {
        out.push(indent(depth) + full);
        if (!closing[name]
            && name[0] !== '!'
            && name[0] !== '?'
            && tag[tag.length-1] !== '/') {
          depth++;
        }
      } else {
        depth--;
        out.push(indent(depth) + full);
      }
    }
    str = out.join('\n');

    // restore the elements to
    // their original locations
    str = str.replace(replace, function($0, $1) {
      return hash[$1];
    });

    // wrap paragraphs
    str = str.replace(wrap, function($0, $1, $2) {
      var indent = $1 + '  '
        , text = indent + $2;

      text = text
        .replace(/[\t\r\n]+/g, '')
        .replace(/(<\/[^>]+>|\/>)(?=\s*<\w)/g, '$1\n' + indent)
        .replace(/(.{75,}?\s+(?![^<]+>))/g, '$1\n' + indent)
        .replace(/([^<>\n]{50,}?)(<[^<]{15,}>)/g, '$1\n' + indent + '$2');

      return $1 + '<p>\n' + text + '\n' + $1 + '</p>';
    });

    return str;
  };
})();

exports.pretty.handle = function(req, res, next) {
  var send = res.send;
  res.send = function(data) {
    res.send = send;
    var type = res.getHeader('Content-Type') || '';
    if ((!type || /html|xml/i.test(type))
        && typeof data === 'string') {
      arguments[0] = data =
        exports.pretty(data);
    }
    return send.apply(res, arguments);
  };
  next();
};

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
