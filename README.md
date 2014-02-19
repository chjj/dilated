# dilated

Dilated is a blog written for [node.js][1]. See a live example at
[dilated.cc][2]. It's modeled after [Kroc Camen's][3] amazing blog. (It more or
less strives to be a faithful port of it.) It's very lightweight: articles are
stored as flat files (in markdown format with JSON metadata). It polls the
filesystem to build an index of posts and check for new/deleted ones.

![dilated][4]

This blog was specifically written for myself. The markup and design are very
specific to my own site. The markup follows the same philosophy of camendesign:
there are no `@id's` or `@classes` used purely for the sake of CSS - instead,
selectors are used to their full potential. The css does not cater to terrible
browsers. etc.

The code is somewhat narrow in what it was designed for. If you want to use
this blog yourself, be prepared to make a few changes. This is a project of
mine that will remain an indefinite work in progress.

## Usage

``` bash
# Start and background dilated:
$ dilated -b
```

### As a module

#### Regular Usage

``` js
var dilated = require('dilated');

var conf = dilated.config.readConfig()
  , app = dilated.createServer(conf);

app.listen();
```

#### Hookable Version

``` js
var dilated = require('dilated');

var conf = dilated.config.readConfig()
  , app = dilated.createServer(conf);

app.server.on('request', function(req, res) {
  // Handle something here
  return app.handle(req, res);
});

app.server.listen(app.conf.port, app.conf.hostname);
```

#### Mountable Version

``` js
var dilated = require('dilated');

var conf = dilated.config.readConfig()
  , app;

conf.webRoot = '/blog';

app = dilated.createServer(conf);

realApp.use('/blog', app);
```

``` js
var dilated = require('dilated');

var conf = dilated.config.readConfig()
  , app = dilated.createServer(conf);

realApp.use(express.vhost('*blog.example.com', app.handle));
```

## Contribution and License Agreement

If you contribute code to this project, you are implicitly allowing your code
to be distributed under the MIT license. You are also implicitly verifying that
all code is your original work. `</legalese>`

## License

Copyright (c) 2011-2014, Christopher Jeffrey. (MIT License)

See LICENSE for more info.

[1]: http://nodejs.org/
[2]: http://dilated.cc/
[3]: http://camendesign.com/
[4]: https://raw.github.com/chjj/dilated/master/static/img/thumb.png
