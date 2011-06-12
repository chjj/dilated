# TODO

- Cache posts on read. Currently any request to an article constitutes a read 
  from disk and parsing of the article's header. Ideally an article could remain 
  in memory for a minute or two. A simple memoization of Post.get could solve this.
  1000+ requests per second is easy to acheive with this. Because this site 
  is somewhat static, it may be better to set up a "meta" serverside cache.
- Add an "enclosure" parameter similar to Kroc's.
- Perhaps decouple the css handler and add it to vanilla as a middleware provider.
- Improve the edit interface.
- Port [remarkable](http://camendesign.com/remarkable) to javascript - 
  maybe fork showdown.
- Fix pretty printer with CDATA blocks.
- Tweak the design a bit, it's become more bloated than necessary.
- Source browsing.