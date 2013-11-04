/**
 * dilated: data.js
 * Copyright (c) 2011-2013, Christopher Jeffrey (MIT License)
 */

/**
 * Data Management
 */

// Where all the data management happens.
// Every function here is defined in async
// style, even when unecessary. This is
// to make it forwardly compatible with a
// database if need be.

module.exports = function(server) {
  var module = { exports: {} }
    , exports = module.exports;

  var fs = require('fs')
    , path = require('path')
    , utils = require('./utils');

  // post file extension
  var extension = '.md'
    , config = server.conf;

  /**
   * Meta
   */

  function meta(index, val) {
    if (arguments.length === 2) {
      return meta.set(index, val);
    }
    return meta.get(index);
  }

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
          key = keys[0];
          break;
        case 'last':
          key = keys[keys.length - 1];
          break;
        default:
          key = index;
          break;
      }
    } else {
      key = index.id || keys[index];
    }

    if (key && docs.hasOwnProperty(key)) {
      return docs[key];
    }
  };

  meta.set = function(key, obj) {
    //debug('set: %s', key);
    var intro = !meta.docs.hasOwnProperty(key);
    meta.docs[key] = obj;
    if (intro) meta.refreshKeys();
    return obj;
  };

  meta.remove = function(key) {
    //debug('meta remove: %s', key);
    if (key.id) key = key.id;
    delete meta.docs[key];
    meta.keys.splice(meta.keys.indexOf(key), 1);
  };

  meta.index = function(key) {
    if (key.id) key = key.id;
    return meta.keys.indexOf(key);
  };

  meta.refreshKeys = function(id) {
    var docs = meta.docs;
    meta.keys = Object.keys(docs).sort(function(a, b) {
      a = docs[a].timestamp;
      b = docs[b].timestamp;
      return a > b ? 1 : (a < b ? -1 : 0);
    });
  };

  meta.asc = function(callback) {
    var keys = meta.keys
      , docs = meta.docs
      , i = 0
      , l = keys.length;

    for (; i < l; i++) {
      if (callback(docs[keys[i]], i) === false) break;
    }
  };

  meta.desc = function(callback) {
    var keys = meta.keys
      , docs = meta.docs
      , i = keys.length;

    while (i--) {
      if (callback(docs[keys[i]], i) === false) break;
    }
  };

  meta.sync = function(post) {
    var stale = meta.get(post.id);
    //debug('sync: %s : %s', post.id, !!stale);
    if (!stale || stale.updated !== post.updated) {
      if (stale) {
        var tags = [].concat(
          post.tags || [],
          stale.tags || []
        );
        tags.forEach(function(tag) {
          if (!~stale.tags.indexOf(tag)) meta.addTag(tag);
          if (!~post.tags.indexOf(tag)) meta.removeTag(tag);
        });
      } else {
        post.tags.forEach(meta.addTag);
      }

      stale = meta.set(post.id, {});

      Object.keys(post).forEach(function(key) {
        if (key !== 'content') {
          stale[key] = post[key];
        }
      });

      meta.refreshTags();
      meta.refreshKeys();

      Post.updated = Date.now();
    }
  };

  meta.__defineGetter__('length', function() {
    return meta.keys.length;
  });

  meta.addTag = function(name) {
    meta.tags[name] = meta.tags[name] || 0;
    meta.tags[name]++;
  };

  meta.removeTag = function(name) {
    if (!meta.tags[name]) return;
    if (!--meta.tags[name]) {
      delete meta.tags[name];
    }
  };

  meta.refreshTags = function() {
    Post.tags = Object
      .keys(meta.tags)
      .sort(function(a, b) {
        return meta.tags[a] > meta.tags[b] ? -1 : 1;
      });
  };

  /**
   * Post
   */

  function Post(data) {
    if (!(this instanceof Post)) {
      return new Post(data);
    }
    if (data) this.merge(data);
  }

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
  Post.get = function(id, callback, tag) {
    return fs.readFile(Post.getPath(id), 'utf8', function(err, data) {
      if (err) {
        if (err.code === 'ENOENT' && meta.get(id)) {
          // post was probably deleted
          // manually make sure the meta
          // gets updated to reflect this
          return Post.remove(id, function() {
            callback(err);
          });
        }
        return callback(err);
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
        return callback(e);
      }

      if (tag && (!data.tags || !~data.tags.indexOf(tag))) {
        return callback(new Error('Not found.'));
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
        adjacent(new Post(data), tag, callback);
      }
    });
  };

  // get the adjacent posts timestamp-wise
  // used for "prev" and "next" links
  function adjacent(post, tag, callback) {
    var index = meta.index(post);

    if (!tag) {
      post.previous = meta.get(index - 1);
      post.next = meta.get(index + 1);
      return callback(null, post);
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

    return callback(null, post);
  }

  // this will filter out "content" and "id"
  // from the post's metadata, because content
  // isnt metadata, and the `id` is redundant
  // when in a file sync the post to the meta
  // afterward
  Post.update = function(id, post, callback) {
    if (id.id) {
      callback = post;
      post = id;
      id = post.id;
    } else {
      post.id = id;
    }

    if (post.content == null) {
      return callback(new Error('No content.'));
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
    return fs.writeFile(Post.getPath(id), out, function() {
      //debug('updating: %s', post.id);
      meta.sync(post);
      if (callback) callback();
    });
  };

  Post.prototype.update = function(callback) {
    return Post.update(this.id, this, callback);
  };

  // delete a post, including its data
  // directory should probably recursively
  // delete the directory(/ies)
  Post.remove = function(post, callback) {
    var id = post.id || post
      , stale = meta.get(id);

    if (stale) {
      if (stale.tags) {
        stale.tags.forEach(meta.removeTag);
        meta.refreshTags();
      }
      meta.remove(id);
    }

    return fs.unlink(Post.getPath(id), function() {
      var dir = Post.getAssetPath(id);
      return fs.readdir(dir, function(err, list) {
        if (err) return callback && callback();
        return utils.forEach(list, function(file, next) {
          file = dir + '/' + file;
          return fs.unlink(file, function() {
            return next();
          });
        }, function() {
          return fs.unlink(dir, function() {
            if (callback) callback();
          });
        });
      });
    });
  };

  Post.prototype.remove = function(callback) {
    return Post.remove(this, callback);
  };

  Post.prototype.sync = function() {
    return meta.sync(this);
  };

  // set arbitrary data that doesnt pollute
  // the main file meant for small pieces of data
  Post.store = function(post, key, val, callback) {
    var id = post.id || post
      , dir = Post.getAssetPath(id);

    Post.retrieve(id, key, function(err, data) {
      if (err) return callback(err);
      data[key] = val;
      fs.stat(dir, function(err) {
        if (err) fs.mkdirSync(dir);
        fs.writeFile(
          Post.getAssetPath(id, 'data.json'),
          JSON.stringify(data),
          function(err) {
            callback(err);
          }
        );
      });
    });

    return this;
  };

  Post.prototype.store = function(key, val, callback) {
    return Post.store(this, key, val, callback);
  };

  Post.retrieve = function(post, key, callback) {
    if (post._data) return callback(null, post._data);

    var id = post.id || post
      , file = Post.getAssetPath(id, 'data.json');

    fs.readFile(file, 'utf8', function(err, data) {
      if (err) return callback(err);
      try {
        data = JSON.parse(data);
      } catch(e) {
        return callback(e);
      }
      if (post.id) {
        define(post, '_data', data);
      }
      callback(null, data);
    });
  };

  Post.prototype.retrieve = function(key, callback) {
    return Post.retrieve(this, key, callback);
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

  Post.getLatest = function(num, callback) {
    var items = [];
    meta.desc(function(item, i) {
      if (i === num) return false;
      items.push(item);
    });
    return callback(null, items);
  };

  Post.getLast = function(tag, callback) {
    var latest;

    if (!callback) {
      callback = tag;
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
      return callback(new Error('No posts.'));
    }

    Post.get(latest.id, callback, tag);
  };

  Post.getByTag = function(tag, callback) {
    var items = [];

    meta.desc(function(item, i) {
      var tags = item.tags;
      if (tags && ~tags.indexOf(tag)) {
        items.push(item);
      }
    });

    return callback
      ? callback(null, items)
      : items;
  };

  Post.search = function(search, callback) {
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
      ? callback(new Error('No posts found.'))
      : callback(null, items);
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

  Post.desc = function(callback, done) {
    meta.desc(callback);
    done();
  };

  Post.asc = function(callback, done) {
    meta.asc(callback);
    done();
  };

  Post.range = function(range, callback, count) {
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
      ? callback(new Error('No items.'))
      : callback(null, items);
  };

  /**
   * File Management
   */

  try {
    fs.statSync(config.content);
  } catch (e) {
    if (server.app.settings.env === 'production') {
      throw e;
    }
    fs.mkdirSync(config.content);
    require('./mock')(fs, config.content, extension);
  }

  /**
   * Parse Header
   */

  function parse(file, callback) {
    var data = new Buffer(256)
      , str = ''
      , pos = 0
      , num = 0
      , i;

    return fs.open(file, 'r', function(err, fd) {
      if (err) return callback(err);
      (function read(done) {
        return fs.read(fd, data, 0, data.length, pos, function(err, bytes) {
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
          return read(done);
        });
      })(function(err) {
        return fs.close(fd, function() {
          try {
            str += data.slice(0, i).toString('utf8');
            data = JSON.parse(str);
          } catch(e) {
            return callback(e);
          }
          return callback(null, data);
        });
      });
    });
  }

  /**
   * Poll Posts
   */

  // check for unindexed posts, index
  // them and parse the header data
  function poll(callback) {
    return fs.readdir(config.content, function(err, list) {
      if (err) return console.error('Polling failed.');
      return utils.forEach(list, function(file, next) {
        var pos = file.indexOf(extension)
          , id;

        if (~pos) {
          id = file.slice(file.lastIndexOf('/') + 1, pos);
        }

        if (!id || meta.get(id)) {
          return next();
        }

        // is the post unindexed?
        file = path.join(config.content, file);
        parse(file, function(err, data) {
          if (err || data.draft) {
            if (err) {
              console.error('Unable to parse %s.', file);
            }
            return next();
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
            data.tags.forEach(meta.addTag);
          }

          return next();
        });
      }, function() {
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
        meta.refreshTags();

        // if we called this directly, do not setTimeout.
        if (callback) {
          return callback();
        }

        // poll again in 5 minutes
        return setTimeout(poll, 5 * 60 * 1000);
      });
    });
  }

  poll();

  /**
   * Helpers
   */

  function define(obj, key, val) {
    Object.defineProperty(obj, key, {
      value: val,
      enumerable: false
    });
  }

  function dateify(date) {
    if (date && !date.toISOString) {
      date = new Date(date);
    }
    if (!date || isNaN(+date)) {
      date = new Date();
    }
    return date;
  }

  function isotime(dt) {
    return dateify(dt).toISOString();
  }

  function mstime(dt) {
    return dateify(dt).getTime();
  }

  /**
   * Expose
   */

  module.exports = exports = meta;
  exports.Post = Post;
  exports.poll = poll;

  return module.exports;
};
