//
// showdown.js -- A javascript port of Markdown.
//
// Copyright (c) 2007 John Fraser.
//
// Original Markdown Copyright (c) 2004-2005 John Gruber
//   <http://daringfireball.net/projects/markdown/>
//
// Redistributable under a BSD-style open source license.
// See license.txt for more information.
//
// The full source distribution is at:
//
//        A A L
//        T C A
//        T K B
//
//   <http://www.attacklab.net/>
//

// showdown-clean
// A fork by chjj (//github.com/chjj).
// Includes some GitHub Flavored Markdown
// modifications (originally by Tekkub),
// as well as some other useful extras.

var showdown = (function() {
  var options
    , __urls
    , __titles
    , __blocks
    , __level;

  var escapeQuotes = function(str) {
    return (str || '').replace(/"/g, '&quot;')
                      .replace(/'/g, '&apos;');
  };

  var stripLinkDefinitions = function(text) {
    text = text.replace(
      /^[ ]{0,3}\[(.+)\]:[ \t]*\n?[ \t]*<?(\S+?)>?[ \t]*\n?[ \t]*(?:(\n*)['(](.+?)[')][ \t]*)?(?:\n+|\Z)/gm,
      function (__, id, url, space, title) {
        id = id.toLowerCase();
        __urls[id] = encodeAmpsAndAngles(url);
        if (space) {
          return space + title;
        } else if (title) {
          __titles[id] = escapeQuotes(title);
        }
        return '';
      }
    );
    return text;
  };

  var hashBlocks = function(text) {
    text = text.replace(/\n/g, '\n\n');

    // element list taken from remarkable:
    //   http://camendesign.com/code/remarkable/remarkable.php
    text = text.replace(
      /^(<(article|aside|audio|blockquote|canvas|caption|col|colgroup|dialog|div|d[ltd]|embed|fieldset|figure|figcaption|footer|form|h[1-6r]|header|input|label|legend|li|nav|noscript|object|[ou]l|optgroup|option|p|param|pre|script|section|select|source|table|t(?:body|foot|head)|t[dhr]|textarea|video|iframe|math)\b[^\r]*?\n<\/\2>[ \t]*(?=\n+))/gm,
      hashElement
    );
    text = text.replace(
      /^(<(article|aside|audio|blockquote|canvas|caption|col|colgroup|dialog|div|d[ltd]|embed|fieldset|figure|figcaption|footer|form|h[1-6r]|header|input|label|legend|li|nav|noscript|object|[ou]l|optgroup|option|p|param|pre|script|section|select|source|table|t(?:body|foot|head)|t[dhr]|textarea|video|iframe|math)\b[^\r]*?.*<\/\2>[ \t]*(?=\n+)\n)/gm,
      hashElement
    );
    text = text.replace(
      /(\n[ ]{0,3}(<(hr)\b([^<>])*?\/?>)[ \t]*(?=\n{2,}))/g,
      hashElement
    );
    text = text.replace(
      /(\n\n[ ]{0,3}<!(--[^\r]*?--\s*)+>[ \t]*(?=\n{2,}))/g,
      hashElement
    );
    text = text.replace(
      /(?:\n\n)([ ]{0,3}(?:<([?%])[^\r]*?\2>)[ \t]*(?=\n{2,}))/g,
      hashElement
    );

    text = text.replace(/\n\n/g, '\n');
    return text;
  };

  var hashElement = function(__, blockText) {
    blockText = blockText.replace(/\n\n/g, '\n');
    blockText = blockText.replace(/^\n/, '');
    blockText = blockText.replace(/\n+$/g, '');

    // my addition, this allows inline formatting inside blocks
    blockText = runSpanGamut(blockText);

    blockText = '\n\n~K' + (__blocks.push(blockText)-1) + 'K\n\n';

    return blockText;
  };

  var runBlockGamut = function(text) {
    text = doHeaders(text);
    var key = hashBlock('<hr/>');
    text = text.replace(/^[ ]{0,2}([ ]?\*[ ]?){3,}[ \t]*$/gm, key);
    text = text.replace(/^[ ]{0,2}([ ]?\-[ ]?){3,}[ \t]*$/gm, key);
    text = text.replace(/^[ ]{0,2}([ ]?\_[ ]?){3,}[ \t]*$/gm, key);
    text = doLists(text);
    text = doCodeBlocks(text);
    text = doBlockQuotes(text);
    text = hashBlocks(text);
    text = formParagraphs(text);
    return text;
  };

  var runSpanGamut = function(text) {
    text = doCodeSpans(text);
    text = escapeSpecialAttrChars(text);
    text = encodeBackslashEscapes(text);
    text = doImages(text);
    text = doAnchors(text);
    text = doAutoLinks(text);
    text = encodeAmpsAndAngles(text);
    text = doItalicsAndBold(text);
    text = text.replace(/  +\n/g, ' <br/>\n');
    return text;
  };

  var escapeSpecialAttrChars = function(text) {
    var pattern = /<[a-z\/!$]('[^']*'|'[^']*'|[^''>])*>|<!(--.*?--\s*)+>/gi;
    text = text.replace(pattern, function(tag) {
      tag = tag.replace(/(.)<\/?code>(?=.)/g, '$1`');
      return escapeCharacters(tag, '\\`*_');
    });
    return text;
  };

  var doAnchors = function(text) {
    text = text.replace(
      /(\[((?:\[[^\]]*\]|[^\[\]])*)\][ ]?(?:\n[ ]*)?\[(.*?)\])()()()()/g,
      writeAnchorTag
    );
    text = text.replace(
      /(\[((?:\[[^\]]*\]|[^\[\]])*)\]\([ \t]*()<?(.*?)>?[ \t]*(([''])(.*?)\6[ \t]*)?\))/g,
      writeAnchorTag
    );
    text = text.replace(
      /(\[([^\[\]]+)\])()()()()()/g,
      writeAnchorTag
    );
    return text;
  };

  var writeAnchorTag = function($0, $1, $2, $3, $4, $5, $6, $7) {
    var match = $1
      , text = $2 // link text
      , id = $3.toLowerCase() // link id
      , url = $4
      , title = $7 || ''
      , result;

    if (url === '') {
      if (id === '') {
        id = text.toLowerCase().replace(/ ?\n/g, ' ');
      }
      url = '#' + id;

      if (__urls[id] != null) {
        url = __urls[id];
        if (__titles[id] != null) {
          title = __titles[id];
        }
      } else {
        if (/\(\s*\)$/m.test(match)) {
          url = '';
        } else {
          return match;
        }
      }
    }

    url = escapeCharacters(url, '*_');
    result = '<a href="' + url + '"';
    if (title !== '') {
      title = escapeQuotes(title);
      title = escapeCharacters(title, '*_');
      result += ' title="' + title + '"';
    }

    // my addition, add rel-external
    // to links with external domains
    if (~url.indexOf('//')) {
      result += ' rel="external"';
    }

    result += '>' + text + '</a>';
    return result;
  };

  var doImages = function(text) {
    text = text.replace(
      /(!\[(.*?)\][ ]?(?:\n[ ]*)?\[(.*?)\])()()()()/g,
      writeImageTag
    );
    text = text.replace(
      /(!\[(.*?)\]\s?\([ \t]*()<?(\S+?)>?[ \t]*(([''])(.*?)\6[ \t]*)?\))/g,
      writeImageTag
    );
    return text;
  };

  var writeImageTag = function($0, $1, $2, $3, $4, $5, $6, $7) {
    var match = $1 // entire match
      , alternate = $2 // alt text
      , id = $3.toLowerCase() // link id
      , url = $4
      , title = $7
      , result;

    if (!title) title = '';
    if (url === '') {
      if (id === '') {
        id = alternate.toLowerCase().replace(/ ?\n/g,' ');
      }
      url = '#' + id;
      if (__urls[id] != null) {
        url = __urls[id];
        if (__titles[id] != null) {
          title = __titles[id];
        }
      } else {
        return match;
      }
    }

    alternate = escapeQuotes(alternate);
    url = escapeCharacters(url, '*_');
    result = '<img src="' + url + '" alt="' + alternate + '"';
    title = escapeQuotes(title);
    title = escapeCharacters(title, '*_');
    result += ' title="' + title + '"/>';

    return result;
  };

  var doHeaders = function(text) {
    text = text.replace(/^(.+)[ \t]*\n=+[ \t]*\n+/gm, function(__, title) {
      return hashBlock('<h1>' + runSpanGamut(title) + '</h1>');
    });
    text = text.replace(/^(.+)[ \t]*\n-+[ \t]*\n+/gm, function(__, title) {
      return hashBlock('<h2>' + runSpanGamut(title) + '</h2>');
    });
    text = text.replace(
      /^(\#{1,6})[ \t]*(.+?)[ \t]*\#*\n+/gm,
      function(__, prefix, title) {
        var level = prefix.length;
        return hashBlock(
          '<h' + level + '>'
          + runSpanGamut(title)
          + '</h' + level + '>'
        );
      }
    );
    return text;
  };

  var doLists = function(text) {
    text += '~0';
    if (__level) {
      text = text.replace(
        /^(([ ]{0,3}([*+-]|\d+[.])[ \t]+)[^\r]+?(~0|\n{2,}(?=\S)(?![ \t]*(?:[*+-]|\d+[.])[ \t]+)))/gm,
        function(__, list, bullet) {
          var result, type = /[*+-]/g.test(bullet) ? 'ul' : 'ol';
          list = list.replace(/\n{2,}/g, '\n\n\n');
          result = processListItems(list);
          result = result.replace(/\s+$/, '');
          result = '<' + type + '>' + result + '</' + type + '>\n';
          return result;
        }
      );
    } else {
      text = text.replace(
        /(\n\n|^\n?)(([ ]{0,3}([*+-]|\d+[.])[ \t]+)[^\r]+?(~0|\n{2,}(?=\S)(?![ \t]*(?:[*+-]|\d+[.])[ \t]+)))/g,
        function(__, runup, list, bullet) {
          var result, type = /[*+-]/g.test(bullet) ? 'ul' : 'ol';
          list = list.replace(/\n{2,}/g, '\n\n\n');
          result = processListItems(list);
          result = runup + '<' + type + '>\n'
                   + result + '</' + type + '>\n';
          return result;
        }
      );
    }
    text = text.replace(/~0/, '');
    return text;
  };

  var processListItems = function(list) {
    __level++;
    list = list.replace(/\n{2,}$/, '\n');
    list += '~0';
    list = list.replace(
      /(\n)?(^[ \t]*)([*+-]|\d+[.])[ \t]+([^\r]+?(\n{1,2}))(?=\n*(~0|\2([*+-]|\d+[.])[ \t]+))/gm,
      function(__, leadingLine, leadingSpace, bullet, item){
        if (leadingLine || /\n{2,}/.test(item)) {
          item = runBlockGamut(outdent(item));
        } else {
          item = doLists(outdent(item));
          item = item.replace(/\n$/, '');
          item = runSpanGamut(item);
        }
        return  '<li>' + item + '</li>\n';
      }
    );
    list = list.replace(/~0/g, '');
    __level--;
    return list;
  };

  var doCodeBlocks = function(text) {
    text += '~0';
    text = text.replace(
      /(?:\n\n|^)((?:(?:[ ]{4}|\t).*\n+)+)(\n*[ ]{0,3}[^ \t\n]|(?=~0))/g,
      function(__, block, nextChar) {
        block = encodeCode(outdent(block));
        block = detab(block);
        block = block.replace(/^\n+/g, '');
        block = block.replace(/\n+$/g, '');
        block = '<pre><code>' + block + '\n</code></pre>';
        return hashBlock(block) + nextChar;
      }
    );
    text = text.replace(/~0/, '');
    return text;
  };

  var hashBlock = function(text) {
    text = text.replace(/(^\n+|\n+$)/g, '');
    return '\n\n~K' + (__blocks.push(text)-1) + 'K\n\n';
  };

  var doCodeSpans = function(text) {
    text = text.replace(
      /(^|[^\\])(`+)([^\r\n]*?[^`])\2(?!`)/gm,
      function(__, pre, ticks, code) {
        code = code.replace(/^([ \t]*)/g, '');
        code = code.replace(/[ \t]*$/g, '');
        code = encodeCode(code);
        return pre + '<code>' + code + '</code>';
      }
    );
    return text;
  };

  var encodeCode = function(text) {
    text = text.replace(/&/g, '&amp;');
    text = text.replace(/</g, '&lt;');
    text = text.replace(/>/g, '&gt;');
    text = escapeCharacters(text, '\*_{}[]\\', false);
    return text;
  };

  var doItalicsAndBold = function(text) {
    text = text.replace(
      /(\*\*|__)(?=\S)([^\r]*?\S[*_]*)\1/g,
      '<strong>$2</strong>'
    );

    if (options.gfm) {
      // ** GFM **  "~E95E" == escaped "_"
      text = text.replace(/(\w)_(\w)/g, '$1~E95E$2');
    }

    text = text.replace(/(\*|_)(?=\S)([^\r]*?\S)\1/g, '<em>$2</em>');
    return text;
  };

  var doBlockQuotes = function(text) {
    text = text.replace(
      /((^[ \t]*>[ \t]?.+\n(.+\n)*\n*)+)/gm,
      function(__, quote) {
        quote = quote.replace(/^[ \t]*>[ \t]?/gm, '~0');
        quote = quote.replace(/~0/g, '');
        quote = quote.replace(/^[ \t]+$/gm, '');
        quote = runBlockGamut(quote);
        quote = quote.replace(/(^|\n)/g, '$1  ');
        quote = quote.replace(/(\s*<pre>[^\r]+?<\/pre>)/gm, function(__, pre) {
          pre = pre.replace(/^  /mg, '~0');
          pre = pre.replace(/~0/g, '');
          return pre;
        });
        return hashBlock('<blockquote>\n' + quote + '\n</blockquote>');
      });
    return text;
  };

  var formParagraphs = function(text) {
    text = text.replace(/^\n+/g, '')
               .replace(/\n+$/g, '');

    var grafs = text.split(/\n{2,}/g)
      , cap
      , out = []
      , str
      , i, l;

    for (i = 0, l = grafs.length; i < l; i++) {
      str = grafs[i];
      if (/~K(\d+)K/g.test(str)) {
        out.push(str);
      } else if (/\S/.test(str)) {
        str = runSpanGamut(str);

        if (options.gfm) {
          // ** GFM **
          str = str.replace(/\n/g, '<br/>');
        }

        str = str.replace(/^([ \t]*)/g, '<p>');
        str += '</p>'
        out.push(str);
      }
    }

    for (i = 0, l = out.length; i < l; i++) {
      while (cap = out[i].match(/~K(\d+)K/)) {
        str = __blocks[cap[1]];
        str = str.replace(/\$/g, '$$$$');
        out[i] = out[i].replace(/~K\d+K/, str);
      }
    }

    return out.join('\n\n');
  };

  var encodeAmpsAndAngles = function(text) {
    text = text.replace(/&(?!#?[xX]?(?:[0-9a-fA-F]+|\w+);)/g, '&amp;');
    text = text.replace(/<(?![a-z\/?\$!])/gi, '&lt;');
    return text;
  };

  var encodeBackslashEscapes = (function() {
    var callback = function(__, ch) {
      var charCodeToEscape = ch.charCodeAt(0);
      return '~E' + charCodeToEscape + 'E';
    };
    return function(text) {
      text = text.replace(/\\(\\)/g, callback);
      text = text.replace(/\\([`*_{}\[\]()>#+-.!])/g, callback);
      return text;
    };
  })();

  var doAutoLinks = function(text) {
    text = text.replace(
      /<((https?|ftp|dict):[^'">\s]+)>/gi,
      function(__, href, protocol) {
        var out = '<a href="' + href + '"';
        // my addition, adds rel-external
        // to external links
        if (!~protocol.indexOf('http') || ~href.indexOf('//')) {
          out += ' rel="external"'
        }
        return out + '>' + href + '</a>';
      }
    );
    text = text.replace(
      /<(?:mailto:)?([-.\w]+\@[-a-z0-9]+(\.[-a-z0-9]+)*\.[a-z]+)>/gi,
      function(__, addr) {
        return encodeEmailAddress(unescapeSpecialChars(addr));
      }
    );
    return text;
  };

  var encodeEmailAddress = (function() {
    var hex = function(ch) {
      return '&#' + ch.charCodeAt(0) + ';';
    };
    var dec = function(ch) {
      ch = ch.charCodeAt(0).toString(16);
      if (ch.length % 2 !== 0) {
        ch = '0' + '' + ch;
      }
      return '&#x' + ch + ';';
    };
    return function(addr) {
      addr = 'mailto:' + addr;
      addr = addr.replace(/./g, function(ch) {
        var r = Math.random();
        if (ch === '@') {
          ch = r > .5 ? hex(ch) : dec(ch);
        } else if (ch !== ':') {
          ch = r > .9 ? ch
            : (r > .45 ? dec(ch) : hex(ch));
        }
        return ch;
      });
      addr = '<a href="' + addr + '">' + addr.split(':')[1] + '</a>';
      return addr;
    };
  })();

  var unescapeSpecialChars = function(text) {
    text = text.replace(/~E(\d+)E/g, function(__, code) {
      return String.fromCharCode(+code);
    });
    return text;
  };

  var outdent = function(text) {
    text = text.replace(/^(\t|[ ]{1,4})/gm, '~0');
    text = text.replace(/~0/g,'')
    return text;
  };

  var detab = function(text) {
    text = text.replace(/\t(?=\t)/g, '    ');
    text = text.replace(/\t/g, '~A~B');
    text = text.replace(/~B(.+?)~A/g, function(__, lead) {
      var numSpaces = 4 - lead.length % 4;
      lead += Array(numSpaces + 1).join(' ');
      return lead;
    });
    text = text.replace(/~A/g, '    ');
    text = text.replace(/~B/g, '');
    return text;
  };

  var escapeCharacters = function(text, charsToEscape, afterBackslash) {
    var regexString = '([' + charsToEscape.replace(/([\[\]\\])/g, '\\$1') + '])';
    if (afterBackslash) {
      regexString = '\\\\' + regexString;
    }
    var regex = new RegExp(regexString, 'g');
    text = text.replace(regex, function($0, $1) {
      var charCodeToEscape = $1.charCodeAt(0);
      return '~E' + charCodeToEscape + 'E';
    });
    return text;
  };

  return function(text, opt) {
    options = opt || {};
    if (options === true) {
      options = { gfm: true };
    }

    __urls = [];
    __titles = [];
    __blocks = [];
    __level = 0;

    text = text.replace(/~/g, '~T');
    text = text.replace(/\$/g, '~D');
    text = text.replace(/\r\n/g, '\n');
    text = text.replace(/\r/g, '\n');
    text = '\n\n' + text + '\n\n';
    text = detab(text);
    text = text.replace(/^[ \t]+$/mg, '');
    text = hashBlocks(text);
    text = stripLinkDefinitions(text);
    text = runBlockGamut(text);
    text = unescapeSpecialChars(text);
    text = text.replace(/~D/g, '$$');
    text = text.replace(/~T/g, '~');

    return text;
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = showdown;
} else {
  this.showdown = showdown;
}