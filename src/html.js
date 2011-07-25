exports.ugly = function(str) {
  var hash = [ '%' ];
  str = str.replace(/%/g, '%%0%%');
  str = str.replace(
  /<(pre|textarea)(?:\s[^>]+)?>[\s\S]+?<\/\1>/g, 
  function(element, name) {
    element = element.replace(/\r?\n/g, '&#x0A;');
    return '%%' + (hash.push(element) - 1) + '%%';
  });
  str = str.replace(/<!--[\s\S]*?-->/g, '');
  str = str.replace(
    /(<([^\s>]+)[^>]*>)([\s\S]+?)(<\/\2)/g, 
    function(element, open, name, text, close) {
      open = open.replace(/\s+/g, ' ');
      text = text.replace(/\s+/g, ' ');
      close = close.replace(/\s+/g, '');
      return open + text + close;
    }
  );
  str = str.replace(/%%(\d+)%%/g, function($0, $1) {
    return hash[$1];
  });
  return str;
};

exports.ugly_ = function(b) {
  b = b.replace(/<!--[\s\S]*?-->/g, '');
  b = b.replace(
  /(<(pre|textarea)(?:\s[^>]+)?>)([\s\S]+?)(<\/\1>)/g, 
  function(_, $1, _, $3, $4) {
    $1 = $1.replace(/\r?\n/g, '&#x0A;')
      .replace(/ /g, '&#x20;')
      .replace(/\t/g, '&#x09');
    return $1 + $3 + $4;
  });

  var b = new Buffer(b)
    , i = 0
    , k = 0
    , l = b.length
    , ch
    , state
    , n
    , c;

  for (; i < l; i++) {
    ch = b[i];
    switch (ch) {
      case 60: // left angle
        state = 'tag';
        b[k++] = ch;
        break;
      case 62: // right angle
        state = 'ignore';
        b[k++] = ch;
        break;
      default:
        if (ch <= 32) { // space
          if (b[i-1] <= 32) break;
          if (state === 'text' 
              && b[i+1] <= 32) {
            n = i;
            while ((c = b[++n])
                   && c <= 32
                   && c !== 60);
            if (c === 60) {
              i = n;
              b[k++] = c;
              break;
            }
          } 
          if (state !== 'ignore') {
            b[k++] = 32;
          }
        } else {
          if (state === 'ignore') {
            state = 'text';
          }
          b[k++] = ch;
        }
        break;
    }
  }

  return b.slice(0, k);
};

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

    while (cap = /^([\s\S]*?)(<([^>]+)>)/.exec(str)) {
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
    var type = res.getHeader('Content-Type') '';
    if ((!type || /html|xml/i.test(type))
        && typeof data === 'string') {
      arguments[0] = data = 
        exports.pretty(data);
    }
    return send.apply(res, arguments);
  };
  next();
};