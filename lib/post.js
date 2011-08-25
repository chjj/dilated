/**
 * Data Management
 */

// where all the data management happens
// every function here is defined in
// async style, even when unecessary.
// this is to make it forwardly
// compatible with a database
// if need be.

var fs = require('fs')
  , path = require('path');

// post file extension
var extension = '.md'
  , config = module.parent.config;

// __meta stores the metadata for all articles
// in-memory, so its easy to sort and query
var __meta = function(index, val) {
  if (arguments.length === 2) {
    return __meta.set(index, val);
  }
  return __meta.get(index);
};

__meta.keys = [];
__meta.docs = {};
__meta.tags = {}; 

__meta.get = function(index) {
  var keys = __meta.keys
    , docs = __meta.docs
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

  if (docs.hasOwnProperty(key)) {
    return docs[key];
  }
};

__meta.set = function(key, obj) {
  var intro = !__meta.docs.hasOwnProperty(key);
  __meta.docs[key] = obj;
  if (intro) __meta.refresh();
  return obj;
};

__meta.remove = function(key) {
  if (key.id) key = key.id;
  delete __meta.docs[key];
  __meta.keys.splice(__meta.indexOf(key), 1);
};

__meta.index = function(key) {
  if (key.id) key = key.id;
  return __meta.keys.indexOf(key);
};

__meta.refresh = function(id) {
  var docs = __meta.docs;
  __meta.keys = Object.keys(docs).sort(function(a, b) {
    a = docs[a].timestamp;
    b = docs[b].timestamp;
    return a > b ? 1 : (a < b ? -1 : 0);
  });
};

__meta.asc = function(func) {
  var keys = __meta.keys
    , docs = __meta.docs
    , i = 0
    , l = keys.length;

  for (; i < l; i++) {
    if (func(docs[keys[i]], i) === false) break;
  }
};

__meta.desc = function(func) {
  var keys = __meta.keys
    , docs = __meta.docs
    , i = keys.length;

  while (i--) {
    if (func(docs[keys[i]], i) === false) break;
  }
};

__meta.sync = function(post) {
  var stale = __meta.get(post.id);
  if (!stale || stale.updated !== post.updated) {
    if (stale) {
      var tags = [].concat(
        post.tags || [],
        stale.tags || []
      );
      tags.forEach(function(tag) {
        if (!~stale.tags.indexOf(tag)) __meta.tags.add(tag);
        if (!~post.tags.indexOf(tag)) __meta.tags.remove(tag);
      });
    } else {
      post.tags.forEach(__meta.tags.add);
    }
    __meta.tags.refresh();

    stale = __meta.set(post.id, {});

    Object.keys(post).forEach(function(key) {
      if (key !== 'content') {
        stale[key] = post[key];
      }
    });

    Post.updated = Date.now();
  }
};

__meta.__defineGetter__('length', function() {
  return __meta.keys.length;
});

__meta.tags.add = function(name) {
  __meta.tags[name] = __meta.tags[name] || 0;
  __meta.tags[name]++;
};

__meta.tags.remove = function(name) {
  if (__meta.tags[name]) __meta.tags[name]--;
};

__meta.tags.refresh = function() {
  Post.tags = Object
    .keys(__meta.tags)
    .sort(function(a, b) {
      return __meta.tags[a] > __meta.tags[b] ? -1 : 1;
    });
};

/**
 * Post
 */

// prefix to avoid ambiguity with `post` variables
var Post = function(data) {
  if (!(this instanceof Post)) {
    return new Post(data);
  }
  if (data) this.merge(data);
};

// very important, this will change whenever
// any alteration occurs, used as a timestamp
// for caching mechanisms
Post.updated = Date.now();

// the top tags for all posts
Post.tags = [];

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
// also ensure the __meta is in sync no matter what
Post.get = function(id, func, tag) {
  fs.readFile(Post.getPath(id), 'utf8', function(err, data) {
    if (err) {
      if (err.code === 'ENOENT' && __meta.get(id)) {
        // post was probably deleted manually
        // make sure the __meta gets updated to reflect this
        return Post.remove(id, function() {
          func(err);
        });
      }
      return func(err);
    }

    try {
      data = data
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n');
      data = /^([^\0]+?)\n\n([^\0]+)$/.exec(data);
      data[1] = JSON.parse(data[1]);
      data[1].id = id;
      data[1].content = data[2];
      data = data[1];
    } catch(e) {
      return func(e);
    }

    // make sure the times are ms for comparisons
    data.timestamp = mstime(data.timestamp);

    // if there was no data.updated time,
    // this post is either new, or the author wanted
    // to have the "updated" timestamp automatically bumped
    if (!data.updated) {
      data.updated = Date.now();

      // we need to update the post file since
      // we gave the post an updated time and
      // potentially a timestamp, updatePost
      // implicitly calls sync
      Post.update(id, data, render);
    } else {
      data.updated = mstime(data.updated);

      // sync the post to __meta with potentially new data
      __meta.sync(data);
      render();
    }

    function render() {
      var post = new Post(data);
      post.adjacent(function(err, obj) {
        Object.keys(obj).forEach(function(key) {
          if (!obj[key]) return;
          define(post, key, {
            id: obj[key].id,
            title: obj[key].title
          });
        });
        if (func) func(err, post);
      }, tag);
    }
  });
};

// this will filter out "content" and "id"
// from the post's metadata, because content 
// isnt metadata, and the `id` is redundant 
// when in a file sync the post to the __meta 
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

  // write to file and update the __meta to reflect the changes
  fs.writeFile(Post.getPath(id), out, function() {
    __meta.sync(post);
    if (func) func();
  });
};

Post.prototype.update = function(func) {
  return Post.update(this.id, this, func);
};

// delete a post, including its data directory
// should probably recursively delete the directory(/ies)
Post.remove = function(post, func) {
  var id = post.id || post
    , stale = __meta.get(id);

  if (stale) {
    if (stale.tags) {
      stale.tags.forEach(__meta.tags.remove);
      __meta.tags.refresh();
    }
    __meta.remove(id);
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
  return __meta.sync(this);
};

// get the adjacent posts timestamp-wise
// used for "prev" and "next" links
Post.adjacent = function(post, func, tag) {
  var index = __meta.index(post);
  func(null, {
    previous: __meta.get(index - 1), 
    next: __meta.get(index + 1)
  });
};

Post.prototype.adjacent = function(func, tag) {
  return Post.adjacent(this, func, tag);
};

// set arbitrary data that doesnt pollute the main file
// meant for small pieces of data
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
  __meta.desc(function(item, i) {
    if (i === num) return false;
    items.push(item);
  });
  return func(null, items);
};

Post.getLast = function(tag, func) {
  var latest;

  if (typeof func !== 'function') {
    func = arguments[0];
    tag = arguments[1];
  }

  if (tag) {
    __meta.desc(function(item, i) {
      var tags = item.tags;
      if (tags && ~tags.indexOf(tag)) {
        latest = item;
        return false;
      }
    });
  } else {
    latest = __meta.get('last');
  }

  if (!latest || !latest.id) {
    return func(new Error('No posts.'));
  }

  Post.get(latest.id, func, tag);
};

// descending
Post.getByTag = function(tag, func) {
  var items = [];

  __meta.desc(function(item, i) {
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

  __meta.desc(function(post) {
    var tags = post.tags 
      ? post.tags.join(' ') 
      : '';
    var str = (post.title + ' ' + tags).toLowerCase();
    if (~str.indexOf(search)) {
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
  __meta.desc(func);
  func();
};

Post.asc = function(func) { 
  __meta.asc(func);
  func();
};

// get a collection of posts by time range
Post.range = function(range, func, count) {
  var items = []
    , start = range.start
    , end = range.end;

  __meta.desc(function(item) {
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

if (!path.existsSync(config.content)) {
  fs.mkdirSync(config.content, 0666);
  require('./mock')(fs, config.content, extension);
}

// get the header of a post - with this
// function we can grab and parse the header
// of 6000+ files in under half a second !
// used for building and managing the __meta
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

// poll the directory and look for
// unindexed files every 5 min
// this is also what initially loads the __meta
(function() {
  // check for unindexed posts, index
  // them and parse the header data
  var poll = function() {
    fs.readdir(config.content, function(err, list) {
      if (err) return console.error('Polling faied.');
      var len = list.length;
      list.forEach(function(file) {
        var pos = file.indexOf(extension)
          , id;

        if (~pos) {
          id = file.slice(file.lastIndexOf('/') + 1, pos);
        }

        if (!id || __meta.get(id)) {
          return --len || done(list);
        }

        // is the post unindexed?
        file = path.join(config.content, file);
        parse(file, function(err, data) {
          if (err || data.draft) {
            if (err) console.error('Unable to parse %s.', file);
            --len || done(list);
            return;
          }

          data.id = id;
          data.timestamp = mstime(data.timestamp);
          data.updated = data.updated 
            ? mstime(data.updated) 
            : Date.now();

          __meta.set(id, data); // index !

          // update the tag index
          // maybe make this its own
          // function for updating posts
          if (data.tags) {
            data.tags.forEach(__meta.tags.add);
          }

          --len || done(list);
        });
      });
    });
  };

  var done = function(list) {
    // check for deleted posts
    // if the directory list length
    // is less than the __meta.length
    // a file must have been deleted by hand
    // need to update the index
    if (list.length < __meta.length) {
      __meta.keys.forEach(function(id) {
        // the post no longer exists!
        if (!~list.indexOf(id + extension)) {
          if (__meta.get(id)) Post.remove(id); 
        }
      });
    }

    // sort the tags by "popularity"
    __meta.tags.refresh();

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

module.exports = Post;
