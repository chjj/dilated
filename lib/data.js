/**
 * Data Management
 */

// where all the data management happens
// every function here is defined in async 
// style, even when unecessary. this is 
// to make it forwardly compatible with a 
// database if need be.

var fs = require('fs')
  , path = require('path');

// post file extension
var extension = '.md'
  , config = module.parent.config;

/**
 * Meta
 */

var meta = function(index, val) {
  if (arguments.length === 2) {
    return meta.set(index, val);
  }
  return meta.get(index);
};

meta.keys = [];
meta.docs = {};
meta.tags = {}; 

meta.get = function(index) {
  var keys = meta.keys
    , docs = meta.docs
    , key;

  if (typeof index === 'string') {
    switch (index) {
      case 'first':
        index = 0;
        break;
      case 'last':
        index = keys.length - 1;
        break;
    }
  }

  key = index.id || keys[index];

  if (key && docs.hasOwnProperty(key)) {
    return docs[key];
  }
};

meta.set = function(key, obj) {
  var intro = !meta.docs.hasOwnProperty(key);
  meta.docs[key] = obj;
  if (intro) meta.refresh();
  return obj;
};

meta.remove = function(key) {
  if (key.id) key = key.id;
  delete meta.docs[key];
  meta.keys.splice(meta.indexOf(key), 1);
};

meta.index = function(key) {
  if (key.id) key = key.id;
  return meta.keys.indexOf(key);
};

meta.refresh = function(id) {
  var docs = meta.docs;
  meta.keys = Object.keys(docs).sort(function(a, b) {
    a = docs[a].timestamp;
    b = docs[b].timestamp;
    return a > b ? 1 : (a < b ? -1 : 0);
  });
};

meta.asc = function(func) {
  var keys = meta.keys
    , docs = meta.docs
    , i = 0
    , l = keys.length;

  for (; i < l; i++) {
    if (func(docs[keys[i]], i) === false) break;
  }
};

meta.desc = function(func) {
  var keys = meta.keys
    , docs = meta.docs
    , i = keys.length;

  while (i--) {
    if (func(docs[keys[i]], i) === false) break;
  }
};

meta.sync = function(post) {
  var stale = meta.get(post.id);
  if (!stale || stale.updated !== post.updated) {
    if (stale) {
      var tags = [].concat(
        post.tags || [],
        stale.tags || []
      );
      tags.forEach(function(tag) {
        if (!~stale.tags.indexOf(tag)) meta.tags.add(tag);
        if (!~post.tags.indexOf(tag)) meta.tags.remove(tag);
      });
    } else {
      post.tags.forEach(meta.tags.add);
    }
    meta.tags.refresh();

    stale = meta.set(post.id, {});

    Object.keys(post).forEach(function(key) {
      if (key !== 'content') {
        stale[key] = post[key];
      }
    });

    Post.updated = Date.now();
  }
};

meta.__defineGetter__('length', function() {
  return meta.keys.length;
});

meta.tags.add = function(name) {
  meta.tags[name] = meta.tags[name] || 0;
  meta.tags[name]++;
};

meta.tags.remove = function(name) {
  if (meta.tags[name]) meta.tags[name]--;
};

meta.tags.refresh = function() {
  Post.tags = Object
    .keys(meta.tags)
    .sort(function(a, b) {
      return meta.tags[a] > meta.tags[b] ? -1 : 1;
    });
};

/**
 * Post
 */

var Post = function(data) {
  if (!(this instanceof Post)) {
    return new Post(data);
  }
  if (data) this.merge(data);
};

/**
 * Last Update Time
 */

Post.updated = Date.now();

/**
 * Visible Tags
 */

Post.tags = [];

/**
 * API
 */

Post.prototype.merge = function(obj) {
  var k = Object.keys(obj)
    , i = k.length;

  while (i--) {
    this[k[i]] = obj[k[i]];
  }

  return this;
};

// get a post, if the post has no "updated" tag
// assume its a new/changed, add an updated tag
// and save the changes to the actual file
// also ensure the meta is in sync no matter what
Post.get = function(id, func, tag) {
  fs.readFile(Post.getPath(id), 'utf8', function(err, data) {
    if (err) {
      if (err.code === 'ENOENT' && meta.get(id)) {
        // post was probably deleted 
        // manually make sure the meta 
        // gets updated to reflect this
        return Post.remove(id, function() {
          func(err);
        });
      }
      return func(err);
    }

    try {
      data = data
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .match(/^([^\0]+?)\n\n([^\0]+)$/);

      data[1] = JSON.parse(data[1]);
      data[1].id = id;
      data[1].content = data[2];

      data = data[1];
    } catch(e) {
      return func(e);
    }

    if (tag && (!data.tags || !~data.tags.indexOf(tag))) {
      return func(new Error('Not found.'));
    }

    // make sure the times are ms for comparisons
    data.timestamp = mstime(data.timestamp);

    // if there was no data.updated time,
    // this post is either new, or the 
    // author wanted to have the "updated" 
    // timestamp automatically bumped
    if (!data.updated) {
      data.updated = Date.now();

      // we need to update the post file since
      // we gave the post an updated time and
      // potentially a timestamp, updatePost
      // implicitly calls sync
      Post.update(id, data, render);
    } else {
      data.updated = mstime(data.updated);

      // sync the post to meta with 
      // potentially new data
      meta.sync(data);
      render();
    }

    function render() {
      adjacent(new Post(data), tag, func);
    }
  });
};

// get the adjacent posts timestamp-wise
// used for "prev" and "next" links
var adjacent = function(post, tag, func) {
  var index = meta.index(post);

  if (!tag) {
    post.previous = meta.get(index - 1);
    post.next = meta.get(index + 1);
    return func(null, post);
  }

  (function seek(key, num) {
    var i = index, cur;
    while (cur = meta.get(i += num)) {
      if (!cur.tags) continue;
      if (~cur.tags.indexOf(tag)) {
        post[key] = cur;
        break;
      }
    }
    return seek;
  })
  ('previous', -1)
  ('next', 1);

  

  return func(null, post);
};

var utils = require('./utils');

Post.prototype.toAtom = function() {
  var post = this;

  var timestamp = new Date(post.timestamp)
    , updated = new Date(post.updated);

  post.title = utils.escapeHTML(post.title);
  post.href = '/' + post.id;

  post.id = 'tag:' 
    + config.host 
    + ',' 
    + timestamp.getFullYear() 
    + ':' 
    + post.id;

  post.published = timestamp.toISOString();
  post.updated = updated.toISOString();

  // there are a few changes that need to occur within
  // the algorithm for converting an html(5) document to
  // an atom feed, change h[x] to h[x-1] to fix the outline
  post.content = utils
    .markdown(post.content)
    .replace(/(<\/?h)([2-6])([^>]*>)/gi, function($0, $1, $2, $3) {
      return $1 + (--$2) + $3;
    });

  return post;
};

Post.prototype.toHTML = function(tag, edit) {
  var post = this;

  var timestamp = new Date(post.timestamp)
    , updated = new Date(post.updated);

  post.permalink = '/' + post.id;
  post.datetime = timestamp.toISOString();
  post.timestamp = utils.prettyTime(post.timestamp);
  post.content = utils.markdown(post.content);

  post.tags = post.buildTags(tag);

  if (post.previous) {
    post.previous.href = '/' 
      + (tag ? tag + '/' : '') 
      + post.previous.id;
  }

  if (post.next) {
    post.next.href = '/' 
      + (tag ? tag + '/' : '') 
      + post.next.id;
  }

  if (edit) {
    post.edit = '/' + post.id + '/edit';
  }

  return post;
};

// this will filter out "content" and "id"
// from the post's metadata, because content 
// isnt metadata, and the `id` is redundant 
// when in a file sync the post to the meta 
// afterward
Post.update = function(id, post, func) {
  if (id.id) {
    func = post;
    post = id;
    id = post.id;
  } else {
    post.id = id;
  }

  if (post.content == null) {
    return func(new Error('No content.'));
  }

  // touch the post
  post.updated = Date.now();

  // stringify and filter out 
  // stuff we dont want in 
  // the actual file
  var out = JSON.stringify(
    post, 
    function(key, val) {
      switch (key) {
        case 'content':
        case 'id':
        case 'next':
        case 'previous':
          return;
        case 'timestamp':
        case 'updated':
          return isotime(val);
        default:
          return val;
      }
    }, 
    2
  );

  out += '\n\n' + post.content;

  // write to file and update the 
  // meta to reflect the changes
  fs.writeFile(Post.getPath(id), out, function() {
    meta.sync(post);
    if (func) func();
  });
};

Post.prototype.update = function(func) {
  return Post.update(this.id, this, func);
};

// delete a post, including its data 
// directory should probably recursively 
// delete the directory(/ies)
Post.remove = function(post, func) {
  var id = post.id || post
    , stale = meta.get(id);

  if (stale) {
    if (stale.tags) {
      stale.tags.forEach(meta.tags.remove);
      meta.tags.refresh();
    }
    meta.remove(id);
  }

  fs.unlink(Post.getPath(id), function() {
    var dir = Post.getAssetPath(id);
    fs.readdir(dir, function(err, list) {
      if (err) return func && func();

      var pending = list.length;
      if (!pending) return done();

      list.forEach(function(file) {
        file = dir + '/' + file;
        fs.unlink(file, function() {
          --pending || done();
        });
      });

      function done() {
        fs.unlink(dir, function() {
          if (func) func();
        });
      }
    });
  });
};

Post.prototype.remove = function(func) {
  return Post.remove(this, func);
};

Post.prototype.sync = function() {
  return meta.sync(this);
};

// set arbitrary data that doesnt pollute 
// the main file meant for small pieces of data
Post.store = function(post, key, val, func) {
  var id = post.id || post
    , dir = Post.getAssetPath(id);

  Post.retrieve(id, key, function(err, data) {
    if (err) return func(err);
    data[key] = val;
    fs.stat(dir, function(err) {
      if (err) fs.mkdirSync(dir);
      fs.writeFile(
        Post.getAssetPath(id, 'data.json'),
        JSON.stringify(data),
        function(err) { 
          func(err); 
        }
      );
    });
  });

  return this;
};

Post.prototype.store = function(key, val, func) {
  return Post.store(this, key, val, func);
};

Post.retrieve = function(post, key, func) {
  if (post._data) return func(null, post._data);

  var id = post.id || post
    , file = Post.getAssetPath(id, 'data.json');

  fs.readFile(file, 'utf8', function(err, data) {
    if (err) return func(err);
    try {
      data = JSON.parse(data);
    } catch(e) {
      return func(e);
    }
    if (post.id) { 
      define(post, '_data', data);
    }
    func(null, data);
  });
};

Post.prototype.retrieve = function(key, func) {
  return Post.retrieve(this, key, func);
};

Post.getPath = function(post, name) {
  return path.join(config.content, (post.id || post) + extension);
};

Post.prototype.getPath = function(name) {
  return Post.getPath(this, name);
};

Post.getAssetPath = function(post, name) {
  return path.join(config.content, (post.id || post), name);
};

Post.prototype.getAssetPath = function(name) {
  return Post.getAssetPath(this, name);
};

Post.getLatest = function(num, func) {
  var items = [];
  meta.desc(function(item, i) {
    if (i === num) return false;
    items.push(item);
  });
  return func(null, items);
};

Post.getLast = function(tag, func) {
  var latest;

  if (!func) {
    func = tag;
    tag = undefined;
  }

  if (tag) {
    meta.desc(function(item, i) {
      var tags = item.tags;
      if (tags && ~tags.indexOf(tag)) {
        latest = item;
        return false;
      }
    });
  } else {
    latest = meta.get('last');
  }

  if (!latest || !latest.id) {
    return func(new Error('No posts.'));
  }

  Post.get(latest.id, func, tag);
};

Post.getByTag = function(tag, func) {
  var items = [];

  meta.desc(function(item, i) {
    var tags = item.tags;
    if (tags && ~tags.indexOf(tag)) {
      items.push(item);
    }
  });

  return func 
    ? func(null, items) 
    : items;
};

Post.search = function(search, func) {
  var search = search.toLowerCase()
    , items = [];

  meta.desc(function(post) {
    var tags = post.tags 
      ? post.tags.join(' ') 
      : '';
    tags = post.title + ' ' + tags;
    if (~tags.toLowerCase().indexOf(search)) {
      items.push(post);
    }
  });

  return !items.length
    ? func(new Error('No posts found.'))
    : func(null, items);
};

Post.buildTags = function(obj, tag) {
  return obj.map(function(name) {
    return { 
      tag: name, 
      set: name === tag 
    };
  });
};

Post.prototype.buildTags = function(tag) {
  return Post.buildTags(this.tags || [], tag);
};

Post.desc = function(func, done) { 
  meta.desc(func);
  func();
};

Post.asc = function(func) { 
  meta.asc(func);
  func();
};

Post.range = function(range, func, count) {
  var items = []
    , start = range.start
    , end = range.end;

  meta.desc(function(item) {
    var t = item.timestamp;
    if (t >= start && t < end) {
      items.push(item);
    }
  });

  return !items.length
    ? func(new Error('No items.'))
    : func(null, items);
};

/**
 * File Management
 */

try {
  fs.statSync(config.content);
} catch(e) {
  fs.mkdirSync(config.content);
  require('./mock')(fs, config.content, extension);
}

/**
 * Parse Header
 */

var parse = function(file, func) {
  var data = new Buffer(256)
    , str = ''
    , i
    , pos = 0
    , num = 0;

  fs.open(file, 'r', function(err, fd) {
    if (err) return func(err);
    (function read(done) {
      fs.read(fd, data, 0, data.length, pos, function(err, bytes) {
        if (err || !bytes) return done(err);
        for (i = 0; i < bytes; i++) {
          if (data[i] === 0x0D) {
            continue; 
          }
          if (data[i] === 0x0A) { 
            if (++num === 2) {
              return done();
            }
          } else if (num) {
            num = 0;
          }
        }
        pos += bytes;
        str += data.toString('utf8');
        read(done);
      });
    })(function(err) {
      fs.close(fd, function() {
        try {
          str += data.slice(0, i).toString('utf8');
          data = JSON.parse(str);
        } catch(e) {
          return func(e);
        }
        func(null, data);
      });
    });
  });
};

/**
 * Poll Posts
 */

(function() {
  // check for unindexed posts, index
  // them and parse the header data
  var poll = function() {
    fs.readdir(config.content, function(err, list) {
      if (err) return console.error('Polling failed.');
      var len = list.length;
      list.forEach(function(file) {
        var pos = file.indexOf(extension)
          , id;

        if (~pos) {
          id = file.slice(file.lastIndexOf('/') + 1, pos);
        }

        if (!id || meta.get(id)) {
          return --len || done(list);
        }

        // is the post unindexed?
        file = path.join(config.content, file);
        parse(file, function(err, data) {
          if (err || data.draft) {
            if (err) {
              console.error('Unable to parse %s.', file);
            }
            --len || done(list);
            return;
          }

          data.id = id;
          data.timestamp = mstime(data.timestamp);
          data.updated = data.updated 
            ? mstime(data.updated) 
            : Date.now();

          meta.set(id, data); // index !

          // update the tag index
          // maybe make this its own
          // function for updating posts
          if (data.tags) {
            data.tags.forEach(meta.tags.add);
          }

          --len || done(list);
        });
      });
    });
  };

  var done = function(list) {
    // check for deleted posts
    // if the directory list length
    // is less than the meta.length
    // a file must have been deleted by hand
    // need to update the index
    if (list.length < meta.length) {
      meta.keys.forEach(function(id) {
        // the post no longer exists!
        if (!~list.indexOf(id + extension)) {
          if (meta.get(id)) Post.remove(id); 
        }
      });
    }

    // sort the tags by "popularity"
    meta.tags.refresh();

    // poll again in 5 minutes
    setTimeout(poll, 5 * 60 * 1000);
  };

  poll();
})();

/**
 * Helpers
 */

var define = function(obj, key, val) {
  Object.defineProperty(obj, key, { 
    value: val,
    enumerable: false
  });
};

var dateify = function(date) {
  if (date && !date.toISOString) {
    date = new Date(date);
  }
  if (!date || isNaN(+date)) {
    date = new Date();
  }
  return date;
};

var isotime = function(dt) {
  return dateify(dt).toISOString();
};

var mstime = function(dt) {
  return dateify(dt).getTime();
};

/**
 * Expose
 */

module.exports = exports = meta;
exports.Post = Post;
