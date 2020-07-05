/**
 * pub-src-redis.js
 * pub-server file source using redis hash mapping path->text
 * supports non-FILE type (opaque) sources with simple key->data get/set
 * provides cache() and flush() to proxy another source
 *
 * TODO - make keys unique across pub-server instances
 * copyright 2015-2020, Jürgen Leschner - github.com/jldec - MIT license
**/

var debug = require('debug')('pub:src-redis');

var u = require('pub-util');

module.exports = function sourceRedis(sourceOpts) {

  sourceOpts = sourceOpts || {};

  var sortEntry = sourceOpts.sortEntry || require('pub-src-fs/sort-entry')(sourceOpts);

  var redisOpts = sourceOpts.redisOpts || {};

  var host = redisOpts.host || process.env.RCH || 'localhost';
  var port = redisOpts.port || process.env.RCP || 6379;

  redisOpts.auth_pass = process.env.RCA || '';

  var redisLib = require('redis');

  // defer createClient until first operation - listener will block node from exiting
  var redis = null;
  var key = sourceOpts.name || sourceOpts.path || 'pub-src-redis-undefined';
  var type  = sourceOpts.type || 'FILE';

  var cacheSrc = null;

  return {
    get: get,
    put: put,
    cache: cache,
    clear: clear,
    unref: unref
  };

  //--//--//--//--//--//--//--//--//--//--//

  // call unref() to allow server to exit gracefully
  function unref() {
    if (redis) { redis.unref(); }
  }

  // connect is called automatically by other methods
  function connect() {
    if (!redis) {
      debug('createClient ' + key + ' at ' + host + ':' + port);
      redis = redisLib.createClient(port, host, redisOpts); }
  }

  // get all files, or if options.stage, get files with `stage` flag.
  function get(options, cb) {
    if (typeof options === 'function') { cb = options; options = {}; }
    connect();

    if (type !== 'FILE') {
      redis.get(key, function(err, s) {
        debug('get %s %s bytes', key, err || u.size(s));
        if (err) return cb(err);
        cb(null, JSON.parse(s));
      });
      return;
    }

    redis.hgetall(key, function(err, data) {
      debug('get %s %s files', key, err || u.size(data));
      if (err) return cb(err);

      // turn single hash object into properly sorted files array
      try {
        var files = [];

        u.each(data, function(json, path) {
          var data = JSON.parse(json);
          if (options.stage && !data.stage) return;
          files.push({ path:path, text:data.text });
        });

        files = u.sortBy(files, function(entry) {
          return sortEntry(entry.path);
        });
      }
      // handle JSON.parse errors by returning []
      // e.g. invalid cache after upgrade
      catch(err) {
        console.log('pub-src-redis get', key, err);
        files = [];
      }

      cb(null, files);
    });
  }

  // put files - if options.stage, put with `stage` flag.
  function put(files, options, cb) {
    if (typeof options === 'function') { cb = options; options = {}; }
    if (!sourceOpts.writable) return cb(new Error('cannot write to non-writable source'));
    connect();

    if (type !== 'FILE') {
      return redis.set(key, JSON.stringify(files), function(err) {
        debug('put json', key, err || u.size(files) + ' bytes');
        cb(err);
      });
    }

    var hash = {};
    u.each(files, function(file) {
      var data = { text:file.text };
      if (options.stage) {
        debug('stage file', key, file.path);
        data.stage = 1;
      }
      hash[file.path] = JSON.stringify(data);
    });
    redis.hmset(key, hash, cb);
  }

  function cache(src, cacheOpts) {
    debug('cache init ' + key + (cacheOpts && cacheOpts.writeThru ? ' (writeThru)' : ''));
    cacheSrc = u.assign({}, src);

    // interpose cachedGet on src.get
    src.get = function cachedGet(options, cb) {
      if (typeof options === 'function') { cb = options; options = {}; }
      get(options, function(err, cachedFiles) {
        if (err) return cb(err);
        if (!options.fromSource && cachedFiles && (type !== 'FILE' || cachedFiles.length)) {
          debug('cache hit ' + key);
          return cb(null, cachedFiles);
        }
        debug((options.fromSource ? 'get from source ' : 'cache miss ') + key);
        cacheSrc.get(options, function(err, srcFiles) {
          if (err) return cb(err);

          // TODO:check for collisions during get from source
          put(srcFiles, options, function(err) {
            if (err) return cb(err);
            cb(null, srcFiles);
          });
        });
      });
    };

    // interpose cachedPut on src.put
    src.put = function cachedPut(files, options, cb) {
      if (typeof options === 'function') { cb = options; options = {}; }
      if (!cacheOpts.writable) return cb(new Error('cannot write to non-writable source'));
      var writeThru = cacheOpts.writeThru || options.writeThru;
      debug('cachedPut %s%s', key, writeThru ? ' (writeThru)' : '');
      var putOpts = u.assign({}, options, writeThru ? null : { stage:1 } );

      put(files, putOpts, function(err) {
        if (err) return cb(err);
        if (writeThru) return cacheSrc.put(files, options, cb);
        return cb();
      });
    };

    // only provide a flush function if the cache is writable and not writeThru
    // (existence of flush used by generator/update to force reload after save)
    if (cacheOpts.writable && !cacheOpts.writeThru) {

      src.flush = function flush(options, cb) {
        if (typeof options === 'function') { cb = options; options = {}; }
        debug('flush ' + key);
        connect();

        // flush single file
        if (type === 'FILE' && options.path) {
          var path = options.path;
          var file;
          // TODO: extract single-file get()
          redis.hget(key, options.path, function(err, data) {
            debug('flush %s %s %s', key, path, err || u.size(data));
            if (err) return cb(err);
            try {
              file = JSON.parse(data);
              if (!file.stage) throw new Error('Cannot flush unstaged file');
            }
            catch(err) {
              console.log('pub-src-redis flush', key, path, err);
              cb(err);
            }
            // delegate to cached put without staging
            src.put([ { path:path, text:file.text } ], { writeThru:1 } , cb);
          });
          return;
        }

        // flush ALL files from cache back to source
        // TODO: if type === `FILE` only flush staged files
        get(options, function(err, cachedFiles) {
          if (err) return cb(err);
          if (cachedFiles && (type !== 'FILE' || cachedFiles.length)) {
            return cacheSrc.put(cachedFiles, options, cb);
          }
          cb();
        });
      };
    }

  }

  // redis-specific api - used for testing
  function clear(options, cb) {
    if (typeof options === 'function') { cb = options; options = {}; }
    debug('clear ' + key);
    connect();
    redis.del(key, cb);
  }

};
