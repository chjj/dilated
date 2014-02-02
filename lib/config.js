/**
 * dilated: config.js
 * Copyright (c) 2011-2014, Christopher Jeffrey (MIT License)
 */

var path = require('path')
  , fs = require('fs');

/**
 * Options
 */

var options;

/**
 * Read Config
 */

function readConfig(file) {
  var home = process.env.HOME
    , conf = {}
    , dir
    , json;

  if (file || options.config) {
    file = path.resolve(process.cwd(), file || options.config);
    dir = path.dirname(file);
    json = options.config;
  } else {
    dir = process.env.DILATED_PATH || path.join(home, '.dilated');
    json = path.join(dir, 'config.json');
  }

  if (exists(dir) && exists(json)) {
    if (!fs.statSync(dir).isDirectory()) {
      json = dir;
      dir = home;
    }

    conf = JSON.parse(fs.readFileSync(json, 'utf8'));
  } else {
    if (!exists(dir)) {
      fs.mkdirSync(dir, 0700);
    }

    fs.writeFileSync(json, JSON.stringify(conf, null, 2));
    fs.chmodSync(json, 0600);
  }

  // expose paths
  conf.dir = dir;
  conf.json = json;

  // flag
  conf.__read = true;

  return checkConfig(conf);
}

function checkConfig(conf) {
  if (typeof conf === 'string') {
    return readConfig(conf);
  }

  conf = clone(conf || {});

  if (conf.config) {
    var file = conf.config;
    delete conf.config;
    merge(conf, readConfig(file));
  }

  // flag
  if (conf.__check) return conf;
  conf.__check = true;

  // merge options
  merge(conf, options.conf);

  // directory and config file
  conf.dir = conf.dir || '';
  conf.json = conf.json || '';

  // https
  conf.https = conf.https || conf.ssl || conf.tls;
  if (conf.https) {
    conf.https.cert = tryReadRaw(conf.https.cert) || conf.https.cert;
    conf.https.key = tryReadRaw(conf.https.key) || conf.https.key;
    conf.https.ca = tryReadRaw(conf.https.ca) || conf.https.ca;
  }

  if (conf.https && (conf.https.enabled === false || conf.https.disabled)) {
    delete conf.https;
  }

  // port
  conf.port = conf.port || 8080;

  // host
  conf.host = conf.host || 'localhost';

  // hostname
  conf.hostname; // '0.0.0.0'

  // root
  conf.root = expand(conf.root) || path.resolve(__dirname, '..');

  // content
  conf.content = expand(conf.content || '~/.dilated/content');

  // log
  conf.log = expand(conf.log);

  // redir
  conf.redir = !!conf.redir;

  // debug
  conf.debug = conf.debug || false;

  return conf;
}

/**
 * Daemonize
 */

function daemonize() {
  if (process.env.IS_DAEMONIC) return;

  var spawn = require('child_process').spawn
    , argv = process.argv.slice()
    , code;

  argv = argv.map(function(arg) {
    arg = arg.replace(/(["$\\])/g, '\\$1');
    return '"' + arg + '"';
  }).join(' ');

  code = '(IS_DAEMONIC=1 setsid ' + argv + ' > /dev/null 2>& 1 &)';
  spawn('/bin/sh', ['-c', code]).on('exit', function(code) {
    process.exit(code || 0);
  });

  stop();
}

/**
 * Help
 */

function help() {
  var spawn = require('child_process').spawn;

  var options = {
    cwd: process.cwd(),
    env: process.env,
    setsid: false,
    customFds: [0, 1, 2]
  };

  spawn('man',
    [__dirname + '/../man/dilated.1'],
    options);

  stop();
}

/**
 * Kill
 */

function killall() {
  var spawn = require('child_process').spawn;

  var options = {
    cwd: process.cwd(),
    env: process.env,
    setsid: false,
    customFds: [0, 1, 2]
  };

  spawn('/bin/sh',
    ['-c', 'kill $(ps ax | grep -v grep | grep dilated | awk \'{print $1}\')'],
    options);

  stop();
}

/**
 * Parse Arguments
 */

function parseArg() {
  var argv = process.argv.slice()
    , opt = { conf: {} }
    , arg;

  function getarg() {
    var arg = argv.shift();

    if (arg.indexOf('--') === 0) {
      // e.g. --opt
      arg = arg.split('=');
      if (arg.length > 1) {
        // e.g. --opt=val
        argv.unshift(arg.slice(1).join('='));
      }
      arg = arg[0];
    } else if (arg[0] === '-') {
      if (arg.length > 2) {
        // e.g. -abc
        argv = arg.substring(1).split('').map(function(ch) {
          return '-' + ch;
        }).concat(argv);
        arg = argv.shift();
      } else {
        // e.g. -a
      }
    } else {
      // e.g. foo
    }

    return arg;
  }

  while (argv.length) {
    arg = getarg();
    switch (arg) {
      case '-p':
      case '--port':
        opt.conf.port = +argv.shift();
        break;
      case '-c':
      case '--config':
        opt.config = argv.shift();
        break;
      case '-h':
      case '--help':
        help();
        break;
      case 'production':
      case '--production':
      case '-d':
      case '--daemonize':
        daemonize();
        break;
      case '-e':
      case '--env':
        opt.conf.env = argv.shift();
        break;
      case '-k':
      case '--kill':
        killall();
        break;
      default:
        break;
    }
  }

  if (process.env.IS_DAEMONIC && !opt.conf.env) {
    opt.conf.env = 'production';
  }

  return opt;
}

options = exports.options = parseArg();

/**
 * Helpers
 */

function tryRequire() {
  try {
    return require(path.resolve.apply(path, arguments));
  } catch (e) {
    ;
  }
}

function tryResolve() {
  var file = path.resolve.apply(path, arguments);
  if (exists(file)) return file;
}

function tryRead() {
  try {
    var file = path.resolve.apply(path, arguments);
    file = expand(file);
    return fs.readFileSync(file, 'utf8');
  } catch (e) {
    ;
  }
}

function tryReadRaw() {
  try {
    var file = path.resolve.apply(path, arguments);
    file = expand(file);
    return fs.readFileSync(file);
  } catch (e) {
    ;
  }
}

function expand(file) {
  if (typeof file !== 'string') return file;
  return file
    .replace(/^~\//, process.env.HOME + '/')
    .replace(/^\.\//, process.env.HOME + '/.dilated/');
}

function exists(file) {
  try {
    fs.statSync(file);
    return true;
  } catch (e) {
    return false;
  }
}

function merge(i, o) {
  Object.keys(o).forEach(function(key) {
    i[key] = o[key];
  });
  return i;
}

function ensure(i, o) {
  Object.keys(o).forEach(function(key) {
    if (!i[key]) i[key] = o[key];
  });
  return i;
}

function clone(obj) {
  return merge({}, obj);
}

function stop() {
  process.once('uncaughtException', function() {});
  throw 'stop';
}

/**
 * Expose
 */

exports.readConfig = readConfig;
exports.checkConfig = checkConfig;

exports.helpers = {
  tryRequire: tryRequire,
  tryResolve: tryResolve,
  tryRead: tryRead,
  tryReadRaw: tryReadRaw,
  expand: expand,
  exists: exists,
  merge: merge,
  ensure: ensure,
  clone: clone
};

merge(exports, exports.helpers);
