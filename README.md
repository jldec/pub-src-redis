# pub-src-redis
[![CI](https://github.com/jldec/pub-src-redis/workflows/CI/badge.svg)](https://github.com/jldec/pub-src-redis/actions)

redis source for pub-server and pub-generator - also provides cache for other source

* uses a redis hash to map file.path to file.text
* supports non-FILE type (opaque) sources with simple key->data get and set
* provides `get()` and `put()` for bulk reads and writes
* also provides `cache()` to proxy-cache another source.
  This is useful for avoiding startup delays on slow/remote sources like github.

NOTE: This library uses [node-redis](https://github.com/redis/node-redis) v3.x because of difficulties upgrading this codebase to v4.x.

## src(options)

```javascript
var src = require('pub-src-redis');

// instantiate source
// options become properties of source
var source = src( { name:'redis-source' } );

// use redis as a cache
source.cache(otherSource, { writeThru:false });

```

### configuring redis keyname
- the redis keyname is derived from `source.name || source.path`

### redis auth
- auth configuration has to come from `process.env.RCA`
- redis host and port can be configured the same way, or via `source.host` and `source.port`

```sh
export RCA={auth-pass}
export RCH={host}
export RCP={port}
```

### source.get(cb)
- `get()` uses `hgetall` to fetch the entire hash in one async operation - no filtering is provided
- the result is an array of file objects each with a `path:` and a `text:` property
- the array is sorted alphabetically by path, as if the files came from a directory tree

### source.put(files, cb)
- `put()` does nothing unless `writable` is set on the source
- it uses `hmset` to write an array of file objects, overwriting any existing files with the same path
- there is no partial file write but the array may contain a subset of the files read via `get()`

### source.cache(src, [cacheOpts])

- interposes `src.get()` and `src.put()`, for a different source (src) like github.

- `src.get()` will read from src on the first call, and subsequently read only from redis,
  unless the option `get({fromSource:true}, cb)` is used

- `src.put()` will write directly to redis.
   `cacheOpts.writeThru` means that `put()` will also write to src before returning

- `src.commit()` writes a single file from cache back to source - only available if `!cacheOpts.writeThru`.

- `src.revert()` reverts a single file from source - only available if `!cacheOpts.writeThru`.

### source.clear(cb)
- redis-specific api - used mainly for testing
- deletes the key used by this src and everything in it - use with care

### source.unref()
- redis-specific api - e.g. used by `pub -O`
- allows the server to exit after creating an instance of src-redis
- for more information, see [node_redis](https://github.com/mranney/node_redis#clientunref)
