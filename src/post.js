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
  , content_dir;

/**
 * Post
 */

// __meta stores the metadata for all articles
// in-memory, so its easy to sort and query
var __meta = {};

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

// tag counter
var __tags = {}; 

// a simple merge
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
      if (err.code === 'ENOENT' && __meta[id]) {
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
      data = /^([\s\S]+?)\n\n([\s\S]+)$/.exec(data);
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
      _sync(data);
      render();
    }

    function render() {
      var post = new Post(data);
      post.getAdjacent(function(err, obj) {
        for (var key in obj) if (obj[key]) {
          Object.defineProperty(post, key, {
            value: {
              id: obj[key].id,
              title: obj[key].title
            }
          });
        }
        if (func) func(err, post);
      }, tag);
    }
  });
};

// update a post file
// this will filter out "content" and "id"
// from the post's metadata, because content isnt metadata,
// and the `id` is redundant when in a file
// sync the post to the __meta afterward
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

  // stringify and filter out stuff we dont
  // want in the actual file
  var out = JSON.stringify(post, function(key, val) {
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
  }, 2);

  out += '\n\n' + post.content;

  // write to file and update the __meta to reflect the changes
  fs.writeFile(Post.getPath(id), out, function() {
    _sync(post);
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
    , stale = __meta[id];

  if (stale) {
    if (stale.tags) {
      stale.tags.forEach(_removeTag);
      _updateTags();
    }
    delete __meta[id];
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

// make sure the __meta is in sync with a post
var _sync = function(post) {
  var stale = __meta[post.id];
  if (!stale || stale.updated !== post.updated) {
    if (stale) {
      // not ideal, but it works for now
      [].concat(
        post.tags || [],
        stale.tags || []
      ).forEach(function(tag) {
        if (!~stale.tags.indexOf(tag)) _addTag(tag);
        if (!~post.tags.indexOf(tag)) _removeTag(tag);
      });
    } else {
      post.tags.forEach(_addTag);
    }
    _updateTags();

    var key
      , k = Object.keys(post)
      , i = k.length;

    stale = __meta[post.id] = {};
    while (i--) {
      key = k[i];
      if (key !== 'content') {
        stale[key] = post[key];
      }
    }
    Post.updated = Date.now();
  }
};

Post.prototype.sync = function() {
  return _sync(this);
};

// get the adjacent posts timestamp-wise
// used for "prev" and "next" links
Post.getAdjacent = function(post, func, tag) {
  var id = post.id || post
    , list = ascending(__meta)
    , i = list.length
    , before
    , after;

  while (i-- && list[i].id !== id);

  if (tag) {
    before = (function() {
      var k = i
        , post;
      while (post = list[--k]) {
        if (post.tags && ~post.tags.indexOf(tag)) {
          return post;
        }
      }
    })();
    after = (function() {
      var k = i
        , post;
      while (post = list[++k]) {
        if (post.tags && ~post.tags.indexOf(tag)) {
          return post;
        }
      }
    })();
  } else {
    before = list[i-1];
    after = list[i+1];
  }
  func(null, {previous: before, next: after});
};

Post.prototype.getAdjacent = function(func, tag) {
  return Post.getAdjacent(this, func, tag);
};

// set arbitrary data that doesnt pollute the main file
// meant for small pieces of data
Post.store = function(post, key, val, func) {
  var id = post.id || post
    , dir = Post.getAssetPath(id);

  Post.retrieve(id, key, function(err, data) {
    if (err) return func(err);
    data[key] = val;
    path.exists(dir, function(exists) {
      if (!exists) fs.mkdirSync(dir, 0666);
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
    if (post.id) { // cache
      Object.defineProperty(post, '_data', {
        value: data, 
        enumerable: false
      });
    }
    func(null, data);
  });
};

Post.prototype.retrieve = function(key, func) {
  return Post.retrieve(this, key, func);
};

Post.getPath = function(post, name) {
  return path.join(content_dir, (post.id || post) + extension);
};

Post.prototype.getPath = function(name) {
  return Post.getPath(this, name);
};

Post.getAssetPath = function(post, name) {
  return path.join(content_dir, (post.id || post), name);
};

Post.prototype.getAssetPath = function(name) {
  return Post.getAssetPath(this, name);
};

// get the latest N posts, only grab metadata
Post.getLatest = function(num, func) {
  return func(null, descending(__meta).slice(0, num));
};

// get the last post
Post.getLast = function(func, tag) {
  var list = tag 
    ? Post.getByTag(tag) 
    : descending(__meta);

  var latest = list.shift();
  if (!latest || !latest.id) {
    return func(new Error('No posts.'));
  }

  Post.get(latest.id, func, tag);
};

// descending
Post.getByTag = function(tag, func) {
  var items = []
    , list = ascending(__meta)
    , i = list.length;

  while (i--) {
    if (list[i].tags && ~list[i].tags.indexOf(tag)) {
      items.push(list[i]);
    }
  }

  return func 
    ? func(null, items) 
    : items;
};

// search every posts metadata for a string
// check the tags and the title
Post.search = function(search, func) {
  var search = search.toLowerCase()
    , items = []
    , key
    , post
    , tags
    , str;

  for (key in __meta) {
    post = __meta[key];
    tags = post.tags 
      ? post.tags.join(' ') 
      : '';
    str = (post.title + ' ' + tags)
      .toLowerCase();
    if (~str.indexOf(search)) {
      items.push(post);
    }
  }

  if (!items.length) {
    func(new Error('No posts found.'));
  } else {
    func(null, items);
  }
};

Post.buildTags = function(obj, tag) {
  return obj.map(function(t) {
    return { 
      tag: t, 
      set: t === tag 
    };
  });
};

Post.prototype.buildTags = function(tag) {
  return Post.buildTags(this.tags || [], tag);
};

// return sorted arrays of post __metadata
// rename to "list" and drop asc??
Post.desc = function(func) { 
  func(null, descending(__meta));
};

Post.asc = function(func) {
  func(null, ascending(__meta));
};

// get a collection of posts by time range
Post.range = function(range, func, count) {
  var items = []
    , start = range.start
    , end = range.end
    , list = ascending(__meta)
    , i = list.length
    , t;

  while (i--) {
    t = list[i].timestamp;
    if (t >= start && t < end) {
      items.push(list[i]);
    }
  }

  if (!items.length) {
    func(new Error('No items.'));
  } else {
    func(null, items);
  }
};

/**
 * File Management
 */

// all the lower level data management
content_dir = config.content;

if (!path.existsSync(content_dir)) {
  fs.mkdirSync(content_dir, 0666);
  require('./mock')(fs, content_dir, extension);
}

// get the header of a post - with this
// function we can grab and parse the header
// of 6000+ files in under half a second !
// used for building and managing the __meta
var header = function(file, func) {
  var data = new Buffer(256)
    , str = ''
    , i
    , pos = 0
    , num = 0;

  fs.open(file, 'r', 0666, function(err, fd) {
    if (err) return func(err);
    (function read(done) {
      fs.read(fd, data, 0, data.length, pos, function(err, bytes) {
        if (err || !bytes) return done(err);
        for (i = 0; i < bytes; i++) {
          if (data[i] === 13) {
            continue; 
          }
          if (data[i] === 10) { 
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

var _addTag = function(name) {
  __tags[name] = __tags[name] || 0;
  __tags[name]++;
};

var _removeTag = function(name) {
  if (__tags[name]) __tags[name]--;
};

var _updateTags = function() {
  Post.tags = Object.keys(__tags).sort(function(a, b) {
    return __tags[a] > __tags[b] ? -1 : 1;
  });
};

// poll the directory and look for
// unindexed files every 5 min
// this is also what initially loads the __meta
(function() {
  // check for unindexed posts, index
  // them and parse the header data
  var poll = function() {
    fs.readdir(content_dir, function(err, list) {
      if (err) return;
      var len = list.length;
      list.forEach(function(file) {
        var pos = file.indexOf(extension), id;
        if (~pos) {
          id = file.slice(file.lastIndexOf('/') + 1, pos);
        }
        if (!id || __meta[id]) {
          return --len || done(list);
        }
        // is the post unindexed?
        file = path.join(content_dir, file);
        header(file, function(err, data) {
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

          __meta[id] = data; // index !

          // update the tag index
          // maybe make this its own
          // function for updating posts
          if (data.tags) {
            data.tags.forEach(_addTag);
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
    var keys = Object.keys(__meta);
    if (list.length < keys.length) {
      keys.forEach(function(id) {
        // the post no longer exists!
        if (!~list.indexOf(id + extension)) {
          if (__meta[id]) Post.remove(id); 
        }
      });
    }

    // sort the tags by "popularity"
    _updateTags();

    // poll again in 5 minutes
    setTimeout(poll, 5 * 60 * 1000);
  };

  poll();
})();

/**
 * Helpers
 */

var ascending = function(obj, key) {
  key = key || 'timestamp';
  if (!Array.isArray(obj)) {
    obj = (function() {
      var a = []
        , k = Object.keys(obj)
        , i = 0
        , l = k.length;

      for (; i < l; i++) {
        a.push(obj[k[i]]);
      }
      return a;
    })();
  }
  obj = obj.sort(function(a, b) {
    a = a[key];
    b = b[key];
    return a > b ? 1 : (a < b ? -1 : 0);
  });
  return obj;
};

// maybe drop ascending completely and have the index
// be a static sorted array, splice things out to delete, etc
// this would prevent the need to sort every time
// but changing timestamps would be hard
var descending = function(obj, key) {
  return ascending(obj, key).reverse();
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