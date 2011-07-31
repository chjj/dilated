# dilated

Dilated is a blog written for [node.js](http://nodejs.org/). See a live example 
at [dilated.cc](http://dilated.cc/). It's modeled after 
[Kroc Camen's](http://camendesign.com/) amazing blog. (It more or less strives 
to be a faithful port of it.) It's very lightweight: articles are stored as flat 
files (in markdown format with JSON metadata). It polls the filesystem 
to build an index of posts and check for new/deleted ones. 

![dilated](http://dilated.cc/img/thumb.png)

This blog was specifically written for myself. The markup and design 
are very specific to my own site. The markup follows the same philosophy of 
camendesign: there are no `@id's` or `@classes` used purely for the sake of 
CSS - instead, selectors are used to their full potential. The css does not 
cater to terrible browsers. etc.

The code is somewhat narrow in what it was designed for. If you want to 
use this blog yourself, be prepared to make a few changes. 
This is a project of mine that will remain an indefinite work in progress.