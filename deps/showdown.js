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
// a fork by chjj (//github.com/chjj)
// includes some GitHub Flavored Markdown 
// modifications originally by Tekkub

var showdown = (function() {
  var g_urls,
      g_titles,
      g_html_blocks,
      g_list_level,
      githubify;
  
  var escapeQuotes = function(str) {
    return (str || '').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  };
  
  var stripLinkDefinitions = function(text) {
    var text = text.replace(
      /^[ ]{0,3}\[(.+)\]:[ \t]*\n?[ \t]*<?(\S+?)>?[ \t]*\n?[ \t]*(?:(\n*)['(](.+?)[')][ \t]*)?(?:\n+|\Z)/gm,
      function ($0, $1, $2, $3, $4) {
        $1 = $1.toLowerCase();
        g_urls[$1] = encodeAmpsAndAngles($2);  
        if ($3) {
          return $3 + $4;
        } else if ($4) {
          g_titles[$1] = escapeQuotes($4);
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
    // removed ins/del from the original showdown code
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
  
  var hashElement = function($0, $1) {
    var blockText = $1;
    blockText = blockText.replace(/\n\n/g, '\n');
    blockText = blockText.replace(/^\n/, '');
    blockText = blockText.replace(/\n+$/g, '');
    blockText = '\n\n~K' + (g_html_blocks.push(blockText)-1) + 'K\n\n';
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
    text = escapeSpecialCharsWithinTagAttributes(text);
    text = encodeBackslashEscapes(text);
    text = doImages(text);
    text = doAnchors(text);
    text = doAutoLinks(text);
    text = encodeAmpsAndAngles(text);
    text = doItalicsAndBold(text);
    text = text.replace(/  +\n/g, ' <br/>\n');
    return text;
  };
  
  var escapeSpecialCharsWithinTagAttributes = function(text) {
    var regex = /(<[a-z\/!$]('[^']*'|'[^']*'|[^''>])*>|<!(--.*?--\s*)+>)/gi;
    text = text.replace(regex, function($0) {
      var tag = $0.replace(/(.)<\/?code>(?=.)/g, '$1`');
      tag = escapeCharacters(tag, '\\`*_');
      return tag;
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
    var link_text = $2,
        link_id = $3.toLowerCase(),
        url = $4,
        title = $7 || '',
        result;
    if (url === '') {
      if (link_id === '') {
        link_id = link_text.toLowerCase().replace(/ ?\n/g, ' ');
      }
      url = '#' + link_id;
      
      if (g_urls[link_id] !== undefined) {
        url = g_urls[link_id];
        if (g_titles[link_id] !== undefined) {
          title = g_titles[link_id];
        }
      } else {
        if (/\(\s*\)$/m.test($1)) {
          url = '';
        } else {
          return $1;
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
    result += '>' + link_text + '</a>';
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
    var whole_match = $1,
        alt_text = $2,
        link_id = $3.toLowerCase(),
        url = $4,
        title = $7,
        result;
    if (!title) title = '';
    if (url === '') {
      if (link_id === '') {
        link_id = alt_text.toLowerCase().replace(/ ?\n/g,' ');
      }
      url = '#' + link_id;
      if (g_urls[link_id] != undefined) {
        url = g_urls[link_id];
        if (g_titles[link_id] != undefined) {
          title = g_titles[link_id];
        }
      } else {
        return whole_match;
      }
    }  
    alt_text = escapeQuotes(alt_text);
    url = escapeCharacters(url, '*_');
    result = '<img src="' + url + '" alt="' + alt_text + '"';
    title = escapeQuotes(title);
    title = escapeCharacters(title, '*_');
    result += ' title="' + title + '"/>';
    return result;
  };
  
  var doHeaders = function(text) {
    text = text.replace(/^(.+)[ \t]*\n=+[ \t]*\n+/gm, function($0, $1) {
      return hashBlock('<h1>' + runSpanGamut($1) + '</h1>');
    });
    text = text.replace(/^(.+)[ \t]*\n-+[ \t]*\n+/gm, function($0, $1) {
      return hashBlock('<h2>' + runSpanGamut($1) + '</h2>');
    });
    text = text.replace(
      /^(\#{1,6})[ \t]*(.+?)[ \t]*\#*\n+/gm, 
      function($0, $1, $2) {
        var h_level = $1.length;
        return hashBlock(
          '<h' + h_level + '>' 
          + runSpanGamut($2) 
          + '</h' + h_level + '>'
        );
      }
    );
    return text;
  };
  
  var doLists = function(text) {
    var whole_list;
    text += '~0';
    if (g_list_level) {
      whole_list = /^(([ ]{0,3}([*+-]|\d+[.])[ \t]+)[^\r]+?(~0|\n{2,}(?=\S)(?![ \t]*(?:[*+-]|\d+[.])[ \t]+)))/gm;
      text = text.replace(whole_list, function($0, $1, $2) {
        var list = $1, result,
            list_type = /[*+-]/g.test($2) ? 'ul' : 'ol';
        list = list.replace(/\n{2,}/g, '\n\n\n');
        result = processListItems(list);
        result = result.replace(/\s+$/, '');
        result = '<' + list_type + '>' + result + '</' + list_type + '>\n';
        return result;
      });
    } else {
      whole_list = /(\n\n|^\n?)(([ ]{0,3}([*+-]|\d+[.])[ \t]+)[^\r]+?(~0|\n{2,}(?=\S)(?![ \t]*(?:[*+-]|\d+[.])[ \t]+)))/g;
      text = text.replace(whole_list,function($0, $1, $2, $3) {
        var runup = $1, list = $2, result,
            list_type = /[*+-]/g.test($3) ? 'ul' : 'ol';
        list = list.replace(/\n{2,}/g, '\n\n\n');
        result = processListItems(list);
        result = runup + '<' + list_type + '>\n' 
                 + result + '</' + list_type + '>\n';  
        return result;
      });
    }
    text = text.replace(/~0/, '');
    return text;
  };
  
  var processListItems = function(list_str) {
    g_list_level++;
    list_str = list_str.replace(/\n{2,}$/, '\n');
    list_str += '~0';
    list_str = list_str.replace(
      /(\n)?(^[ \t]*)([*+-]|\d+[.])[ \t]+([^\r]+?(\n{1,2}))(?=\n*(~0|\2([*+-]|\d+[.])[ \t]+))/gm,
      function($0, $1, $2, $3, $4){
        var item = $4,
            leading_line = $1,
            leading_space = $2;
        if (leading_line || /\n{2,}/.test(item)) {
          item = runBlockGamut(outdent(item));
        } else {
          item = doLists(outdent(item));
          item = item.replace(/\n$/, ''); 
          item = runSpanGamut(item);
        }
        return  '<li>' + item + '</li>\n';
      }
    );
    list_str = list_str.replace(/~0/g, '');
    g_list_level--;
    return list_str;
  };
  
  var doCodeBlocks = function(text) {
    text += '~0';
    text = text.replace(
      /(?:\n\n|^)((?:(?:[ ]{4}|\t).*\n+)+)(\n*[ ]{0,3}[^ \t\n]|(?=~0))/g,
      function($0, $1, $2) {
        var codeblock = $1, nextChar = $2;
        codeblock = encodeCode( outdent(codeblock));
        codeblock = detab(codeblock);
        codeblock = codeblock.replace(/^\n+/g, '');
        codeblock = codeblock.replace(/\n+$/g, '');
        codeblock = '<pre><code>' + codeblock + '\n</code></pre>';
        return hashBlock(codeblock) + nextChar;
      }
    );
    text = text.replace(/~0/, '');
    return text;
  };
  
  var hashBlock = function(text) {
    text = text.replace(/(^\n+|\n+$)/g, '');
    return '\n\n~K' + (g_html_blocks.push(text)-1) + 'K\n\n';
  };
  
  var doCodeSpans = function(text) {
    text = text.replace(
      /(^|[^\\])(`+)([^\r]*?[^`])\2(?!`)/gm, 
      function($0, $1, $2, $3, $4) {
        $3 = $3.replace(/^([ \t]*)/g, '');  
        $3 = $3.replace(/[ \t]*$/g, '');  
        $3 = encodeCode($3);
        return $1 + '<code>' + $3 + '</code>';
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
    
    if (githubify) {
      // ** GFM **  "~E95E" == escaped "_"
      text = text.replace(/(\w)_(\w)/g, '$1~E95E$2'); 
    }
    
    text = text.replace(/(\*|_)(?=\S)([^\r]*?\S)\1/g, '<em>$2</em>');
    return text;
  };
  
  var doBlockQuotes = function(text) {
    text = text.replace(
      /((^[ \t]*>[ \t]?.+\n(.+\n)*\n*)+)/gm,
      function(__, bq) {
        bq = bq.replace(/^[ \t]*>[ \t]?/gm, '~0'); 
        bq = bq.replace(/~0/g, '');
        bq = bq.replace(/^[ \t]+$/gm, ''); 
        bq = runBlockGamut(bq); 
        bq = bq.replace(/(^|\n)/g, '$1  ');
        bq = bq.replace(/(\s*<pre>[^\r]+?<\/pre>)/gm, function(__, pre) {
          pre = pre.replace(/^  /mg, '~0');
          pre = pre.replace(/~0/g, '');
          return pre;
        });
        return hashBlock('<blockquote>\n' + bq + '\n</blockquote>');
      });
    return text;
  };
  
  var formParagraphs = function(text) {
    text = text.replace(/^\n+/g, '');
    text = text.replace(/\n+$/g, '');
    var out = [], str, i, l,
        grafs = text.split(/\n{2,}/g);
    for (i = 0, l = grafs.length; i < l; i++) {
      str = grafs[i];
      if (/~K(\d+)K/g.test(str)) {
        out.push(str);
      } else if (/\S/.test(str)) {
        str = runSpanGamut(str);
        
        if (githubify) {
          str = str.replace(/\n/g, '<br/>');  // ** GFM **
        }
        
        str = str.replace(/^([ \t]*)/g, '<p>');
        str += '</p>'
        out.push(str);
      }
    }
    for (i = 0, l = out.length; i < l; i++) {
      while (/~K(\d+)K/.test(out[i])) {
        str = g_html_blocks[RegExp.$1];
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
    var callback = function($0, $1) {
      var charCodeToEscape = $1.charCodeAt(0);
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
      /<((https?|ftp|dict):[^''>\s]+)>/gi, 
      '<a href="$1">$1</a>'
    );
    text = text.replace(
      /<(?:mailto:)?([-.\w]+\@[-a-z0-9]+(\.[-a-z0-9]+)*\.[a-z]+)>/gi,
      function($0, $1) {
        return encodeEmailAddress(unescapeSpecialChars($1));
      }
    );
    return text;
  };
  
  var encodeEmailAddress = (function() {
    var encode = [
      function(ch) { 
        return '&#' + ch.charCodeAt(0) + ';'; 
      },
      function(ch) { 
        ch = ch.charCodeAt(0).toString(16);
        if (ch.length % 2 !== 0) {
          ch = '0' + '' + ch;
        }
        return '&#x' + ch + ';'; 
      },
      function(ch) { 
        return ch; 
      }
    ];
    return function(addr) {
      addr = 'mailto:' + addr;
      addr = addr.replace(/./g, function(ch) {
        if (ch === '@') {
          ch = encode[Math.floor(Math.random() * 2)](ch);
        } else if (ch !== ':') {
          var r = Math.random();
          ch = (
            r > .9 
              ? encode[2](ch)   
              : r > .45 
                ? encode[1](ch) 
                : encode[0](ch)
          );
        }
        return ch;
      });
      addr = '<a href="' + addr + '">' + addr + '</a>';
      addr = addr.replace(/'>.+:/g, '">'); 
      return addr;
    };
  })();
  
  var unescapeSpecialChars = function(text) {
    text = text.replace(/~E(\d+)E/g, function($0, $1) {
      return String.fromCharCode(+$1);
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
    text = text.replace(/~B(.+?)~A/g, function($0, $1, $2) {
      var lead = $1, numSpaces = 4 - lead.length % 4; 
      lead += Array(numSpaces + 1).join(' ');
      return lead;
    });
    text = text.replace(/~A/g, '    ');  
    text = text.replace(/~B/g, '');
    return text;
  };
  
  var escapeCharacters = function(text, charsToEscape, afterBackslash) {
    var regexString = '([' + charsToEscape.replace(/([\[\]\\])/g,'\\$1') + '])';
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
  
  return function(text, gfm) {
    g_urls = [];
    g_titles = [];
    g_html_blocks = [];
    g_list_level = 0;
    githubify = !!gfm;
    
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