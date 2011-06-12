exports.escapeHTML = function(html, once) {
  return (html || '')
    .replace((once ? /&(?![^\s;]+;)/g : /&/g), '&amp;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
};

exports.date = function(date) {
  if (!date.getUTCFullYear) date = new Date(date);
  date = date.toLocaleDateString();
  date = date.split(/,\s+|\s+/);
  date = {
    day: date[0],
    month: date[1],
    date: date[2],
    year: date[3]
  };
  return date.month + ' ' + date.date + ', ' + date.year;
};

exports.time = function(date) {
  if (!date.getUTCFullYear) date = new Date(date);
  var hours = +date.getHours(),
      minutes = date.getMinutes().toString(),
      meridiem = hours < 12 ? 'am' : 'pm';
  if (hours === 0) hours = 12; 
  if (hours > 12) hours -= 12; 
  if (minutes.length < 2) minutes = '0' + '' + minutes; 
  return hours + ':' + minutes + ' ' + meridiem;
};

exports.datetime = function(date) {
  return exports.date(date) + ' ' + exports.time(date);
};

exports.prettyTime = function(time) {
  var date = time.getUTCFullYear ? time : new Date(time),
      sec = Math.floor(new Date(Date.now() - date.getTime()) / 1000),
      days = Math.floor(sec / 86400);
  
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
      return Math.floor(sec / 60) + ' minutes ago';
    }
    if (sec < 7200) {
      return '1 hour ago';
    }
    return Math.floor(sec / 3600) + ' hours ago';
  } 
  
  if (days < 31) {
    if (days === 1) {
      return 'yesterday';
    }
    if (days < 14) {
      return days + ' days ago';
    }
    return Math.floor(days / 7) + ' weeks ago';
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

exports.markdown = exports.showdown = (function() {
  var showdown = require('../deps/showdown');
  return function(text) { 
    return showdown(text);
  };
})();

// my own html pretty printer, doesnt play nice
// with CDATA blocks currently
exports.prettyHTML = (function() { 
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
  return function(text) {
    var place = [], stack = [], tag, cap, num = 0;
    
    // temporarily remove elements before processing
    text = text.replace(
      /<(pre|textarea|title|p|li|a)(?:\s[^>]+)?>[\s\S]+?<\/\1>/g, 
      function($0, $1) { 
      if ($1 === 'pre' || $1 === 'textarea') {
        $0 = $0.replace(/\r?\n/g, '&#x0A;');
      } else {
        //$0 = $0.replace(/\s*[\r\n]+\s*/g, '');
        $0 = $0.replace(/(<[^\/][^>]*>)\s+|\s+(<\/)/g, '$1$2').replace(/[\r\n]/g, '');
      }
      return '<!' + (place.push($0)-1) + (Array($0.length-3).join('%')) + '/>';
    });
    
    // indent elements
    text = text.replace(/(>)\s+|\s+(<)/g, '$1$2').replace(/[\r\n]/g, '');
    while (cap = text.match(/^([\s\S]*?)<([^>]+)>/)) {
      text = text.slice(cap[0].length);
      tag = cap[2].split(' ')[0];
      if (cap[1]) stack.push(indent(num) + cap[1]);
      if (tag[0] !== '/') {
        stack.push(indent(num) + '<' + cap[2] + '>');
        if (!closing[tag] && tag[0] !== '!' && cap[2].slice(-1) !== '/') {
          num++;
        }
      } else {
        num--;
        stack.push(indent(num) + '<' + cap[2] + '>');
      }
    }
    text = stack.join('\n');
    
    // restore the elements to their original locations
    text = text.replace(/<!(\d+)%*\/>/g, function($0, $1) { 
      return place[$1]; 
    });
    
    // wrap paragraphs
    text = text.replace(/([ \t]*)<p>([\s\S]+?)<\/p>/g, function($0, $1, $2) {
      var indent = $1 + '  ', text = indent + $2;
      
      text = text.replace(/[\t\r\n]+/g, '')
        .replace(/(<\/[^>]+>|\/>)(?=\s*<\w)/g, '$1\n' + indent)
        .replace(/(.{75,}?\s+(?![^<]+>))/g, '$1\n' + indent)
        .replace(/([^<>\n]{50,}?)(<[^<]{15,}>)/g, '$1\n' + indent + '$2');
      
      return $1 + '<p>\n' + text + '\n' + $1 + '</p>';
    });
    
    return text;
  };
})();