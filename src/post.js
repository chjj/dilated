// Post Management
// where all the data management happens
// every function here is defined in
// async style, even when unecessary.
// this is to make it forwardly 
// compatible with a database 
// if need be.

var fs = require('fs'),
    path = require('path');

// post file extension
var extension = '.md', content_dir; 

// $meta stores the metadata for all articles
// in-memory, so its easy to sort and query
var $meta = {};

// prefix to avoid ambiguity with `post` variables
var $Post = function(data) {
  if (!(this instanceof $Post)) {
    return new $Post(data);
  }
  if (data) this.merge(data);
};
module.exports = $Post;

// very important, this will change whenever
// any alteration occurs, used as a timestamp
// for caching mechanisms
$Post.updated = Date.now();

// the top tags for all posts
$Post.tags = [];

// ideally shouldnt have to expose this
$Post.meta = $meta;

// a simple merge
$Post.prototype.merge = function(obj) {
  var k = Object.keys(obj), i = k.length;
  while (i--) {
    this[k[i]] = obj[k[i]];
  }
  return this;
};

// get a post, if the post has no "updated" tag
// assume its a new/changed, add an updated tag
// and save the changes to the actual file
// also ensure the $meta is in sync no matter what
$Post.get = function(id, func, tag) {
  fs.readFile($Post.getPath(id), 'utf-8', function(err, data) {
    if (err) {
      if (err.code === 'ENOENT' && $meta[id]) { 
        // post was probably deleted manually
        // make sure the $meta gets updated to reflect this
        delete $meta[id];
        return func(err);
      }
      return func(err);
    }
    
    try {
      data = data.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      data = data.match(/^([\s\S]+?)\n\n([\s\S]+)$/).slice(1);
      data[0] = JSON.parse(data[0]);
      data[0].id = id;
      data[0].content = data[1];
      data = data[0];
    } catch(e) {
      return func(e);
    }
    
    var post = new $Post(data);
    
    // make sure the times are ms for comparisons
    post.timestamp = mstime(post.timestamp); 
    
    // if there was no data.updated time, 
    // this post is either new, or the author wanted
    // to have the "updated" timestamp automatically bumped
    if (!post.updated) { 
      post.updated = Date.now();
      
      // we need to update the post file since 
      // we gave the post an updated time and 
      // potentially a timestamp, update$Post 
      // implicitly calls sync
      post.update(function() {
        render(post, func, tag); 
      });
    } else {
      post.updated = mstime(post.updated);
      
      // sync the post to $meta with potentially new data
      post._sync();
      render(post, func, tag); 
    }
  });
};

var render = function(post, func, tag) {
  post.getAdjacent(function(err, obj) {
    for (var key in obj) {
      if (obj[key]) {
        Object.defineProperty(post, key, {
          value: {
            id: obj[key].id,
            title: obj[key].title
          }
        });
      }
    }
    if (func) func(err, post);
  }, tag);
};

// update a post file
// this will filter out "content" and "id"
// from the post's metadata, because content isnt metadata,
// and the `id` is redundant when in a file
// sync the post to the $meta afterward
$Post.prototype.update = function(func) {
  var self = this;
  
  if (this.content == null) {
    return func(new Error('No content.'));
  }
  
  // touch the post
  this.updated = Date.now(); 
  
  // stringify and filter out stuff we dont
  // want in the actual file
  var out = JSON.stringify(this, function(key, val) {
    if (key === 'content' || key === 'id') {
      return;
    } 
    if (key === 'timestamp' || key === 'updated') {
      return isotime(val);
    }
    return val;
  }, 2);
  
  out += '\n\n' + this.content;
  
  // write to file and update the $meta to reflect the changes
  fs.writeFile(this.getPath(), out, function() {
    self._sync();
    if (func) func();
  });
};

// delete a post, including its data directory
// should probably recursively delete the directory(/ies)
$Post.prototype.remove = function(func) {
  var id = this.id || this;
  if ($meta[id]) delete $meta[id];
  fs.unlink(this.getPath(), function() {
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

// make sure the $meta is in sync with a post
$Post.prototype._sync = function() {
  var meta = $meta[this.id];
  if (!meta || meta.updated !== this.updated) { 
    var key, k = Object.keys(this), i = k.length;
    meta = $meta[this.id] = {};
    while (i--) {
      key = k[i];
      if (key !== 'content') {
        meta[key] = this[key];
      }
    }
    $Post.updated = Date.now();
  }
};

// get the adjacent posts timestamp-wise
// used for "prev" and "next" links
$Post.prototype.getAdjacent = function(func, tag) {
  var m = ascending($meta), i = m.length, before, after;
  while (i-- && m[i].id !== this.id);
  if (tag) {
    before = (function() {
      var k = i, data;
      while (data = m[--k]) {
        if (data.tags && ~data.tags.indexOf(tag)) {
          return data;
        }
      }
    })();
    after = (function() {
      var k = i, data;
      while (data = m[++k]) {
        if (data.tags && ~data.tags.indexOf(tag)) {
          return data;
        }
      }
    })();
  } else {
    before = m[i-1];
    after = m[i+1];
  }
  func(null, {previous: before, next: after});
};

// set arbitrary data that doesnt pollute the main file
// meant for small pieces of data
$Post.prototype.store = function(key, val, func) {
  var self = this, dir = this.getAssetPath(); 
  this.retrieve(key, function(err, data) {
    if (err) return func.call(this, err);
    data[key] = val;
    path.exists(dir, function(exists) {
      if (!exists) fs.mkdirSync(dir, 0666);
      fs.writeFile(
        self.getAssetPath('data.json'), 
        JSON.stringify(data), 
        function(err) { func.call(self, err); }
      );
    });
  });
  return this;
};

$Post.prototype.retrieve = function(key, func) {
  if (this._data) return func.call(this, null, this._data);
  var self = this, file = this.getAssetPath('data.json'); 
  fs.readFile(file, 'utf-8', function(err, data) {
    if (err) return func.call(self, err);
    try {
      data = JSON.parse(data);
    } catch(e) {
      return func.call(self, e);
    }
    Object.defineProperty(self, '_data', { value: data });
    func.call(self, null, data);
  });
  return this;
};

$Post.getPath = function(id, name) {
  return path.join(content_dir, id + extension);
};

$Post.getAssetPath = function(id, name) {
  return path.join(content_dir, id, name);
};

$Post.prototype.getPath = function(name) {
  return $Post.getPath(this.id, name);
};

$Post.prototype.getAssetPath = function(name) {
  return $Post.getAssetPath(this.id, name);
};

// get the latest N posts, only grab $metadata
$Post.getLatest = function(num, func) {
  return func(null, descending($meta).slice(0, num));
};

// get the last post
$Post.getLast = function(func, tag) {
  var list = tag ? $Post.getByTag(tag) : descending($meta);
  var latest = list.shift();
  if (!latest || !latest.id) {
    return func(new Error('No posts.'));
  }
  $Post.get(latest.id, func, tag);
};

// descending
$Post.getByTag = function(tag, func) {
  var items = [], m = ascending($meta), i = m.length;
  while (i--) {
    if (m[i].tags && ~m[i].tags.indexOf(tag)) {
      items.push(m[i]);
    }
  }
  return func ? func(null, items) : items;
};

// search every posts metadata for a string
// check the tags and the title
$Post.search = function(search, func) {
  var items = [], k, post, tags;
  search = search.toLowerCase();
  for (k in $meta) {
    post = $meta[k],
    tags = post.tags ? post.tags.join(' ') : '',
    data = (post.title + ' ' + tags).toLowerCase();
    if (data.match(search)) {
      items.push(post);
    }
  }
  func(null, items);
};

$Post.buildTags = function(obj, tag) {
  return obj.map(function(t) {
    return { tag: t, set: t === tag };
  });
};

$Post.prototype.buildTags = function(tag) {
  return $Post.buildTags(this.tags || []);
};

// return sorted arrays of post $metadata
$Post.desc = function(func) { // rename to "list" and drop asc??
  func(null, descending($meta));
};

$Post.asc = function(func) {
  func(null, ascending($meta));
};

// get a collection of posts by time range
$Post.range = function(range, func, count) {
  var items = [],
      start = range.start, 
      end = range.end,
      m = ascending($meta),
      i = m.length, t;
  while (i--) {
    t = m[i].timestamp;
    if (t >= start && t < end) {
      items.push(m[i]);
    }
  }
  if (!items.length) {
    func(new Error('No items.'));
  } else {
    func(null, items);
  }
};

// ========== FILE MANAGEMENT ========== //
// all the lower level data management 
content_dir = (function() {
  try {
    return global.config.content.replace(/^\./, __dirname + '/..');
  } catch(e) {
    return __dirname + '/../content';
  }
})();

if (!path.existsSync(content_dir)) {
  fs.mkdirSync(content_dir, 0666);
  require('./mock')(fs, content_dir, extension);
}

// get the header of a post - with this 
// function we can grab and parse the header 
// of 6000+ files in under half a second !
// used for building and managing the $meta
var header = function(file, func) {
  var data = new Buffer(256);
  var str = '', i, pos = 0, num = 0;
  fs.open(file, 'r', 0666, function(err, fd) {
    if (err) return func(err);
    (function read(done) {
      fs.read(fd, data, 0, data.length, pos, function(err, bytes) {
        if (err || !bytes) return done(err);
        for (i = 0; i < bytes; i++) {
          if (data[i] === 13) {
            continue; // ignore CR
          }
          if (data[i] === 10) { // LF
            if (++num === 2) {
              return done();
            }
          } else if (num) {
            num = 0;
          }
        }
        pos += bytes;
        str += data.toString('utf-8');
        read(done);
      });
    })(function(err) {
      fs.close(fd, function() {
        try {
          data = JSON.parse(str + data.slice(0, i).toString('utf-8')); 
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
// this is also what initially loads the $meta
(function() {
  var tags = {};
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
        if (!id || $meta[id]) {
          return --len || done(list);
        }
        // is the post unindexed?
        file = path.join(content_dir, file);
        header(file, function(err, data) {
          if (err) return;
          
          data.id = id;
          data.timestamp = mstime(data.timestamp); 
          data.updated = data.updated ? mstime(data.updated) : Date.now();
          
          $meta[id] = data; // index !
          
          // update the tag index
          // maybe make this its own 
          // function for updating posts
          if (data.tags) { 
            var tag, t = data.tags.length;
            while (t--) {
              tag = data.tags[t];
              tags[tag] = tags[tag] || 0;
              tags[tag]++;
            }
          }
          
          --len || done(list);
        });
      });
    });
  };
  
  var done = function(list) {
    // check for deleted posts
    // if the directory list length
    // is less than the $meta.length
    // a file must have been deleted by hand
    // need to update the index
    var keys = Object.keys($meta);
    if (list.length < keys.length) {
      keys.forEach(function(id) {
        // the post no longer exists!
        if (!~list.indexOf(id + extension)) {
          if ($meta[id]) delete $meta[id];
        }
      });
    }
    
    // sort the tags by "popularity"
    $Post.tags = Object.keys(tags).sort(function(a, b) {
      return tags[a] > tags[b] ? -1 : 1;
    });
    
    // poll again in 5 minutes
    setTimeout(poll, 5 * 60 * 1000);
  };
  
  poll();
})();

// ========== HELPERS ========== //
var ascending = function(obj, key) {
  key = key || 'timestamp';
  if (!Array.isArray(obj)) {
    obj = (function() {
      var a = [], k = Object.keys(obj);
      for (var i = 0, l = k.length; i < l; i++) {
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
  if (!date || date.toString() === 'Invalid Date') {
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