/**
 * pub-src-redis.js
 * pub-server file source using redis hash mapping path->text
 * supports non-FILE type (opaque) sources with simple key->data get/set
 * provides cache() and flush() to proxy another source
 *
 * TODO - make keys unique across pub-server instances
 * copyright 2015, Jurgen Leschner - github.com/jldec - MIT license
**/

var debug = require('debug')('pub:src-redis');

var u = require('pub-util');
var path = require('path');

module.exports = function sourceRedis(sourceOpts) {

  sourceOpts = sourceOpts || {};

  var sortEntry = sourceOpts.sortEntry || require('pub-src-fs/sort-entry')(sourceOpts);

  var redisOpts = typeof sourceOpts.src === 'object' ? u.omit(sourceOpts.src, 'pkg') : {};

  var host = redisOpts.host || process.env.RCH || 'localhost';
  var port = redisOpts.port || process.env.RCP || 6379;

  redisOpts.auth_pass = process.env.RCA || '';

  var redisLib = require('redis');

  // defer createClient until first operation - listener will block node from exiting
  var redis = null;
  var key = sourceOpts.name || sourceOpts.path || 'pub-src-redis-undefined';
  var type  = sourceOpts.type || 'FILE';

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
      var files = u.map(data, function(text, path) {
        return { path:path, text:text };
      });

      files = u.sortBy(files, function(entry) {
        return sortEntry(entry.path);
      });

      cb(null, files);
    });
  }

  function put(files, options, cb) {
    if (typeof options === 'function') { cb = options; options = {}; }
    if (!sourceOpts.writable) return cb(new Error('cannot write to non-writable source'));
    debug('put ' + key);
    connect();

    if (type !== 'FILE') return redis.set(key, JSON.stringify(files), cb);

    var hash = {};
    u.each(files, function(file) {
      hash[file.path] = file.text;
    });
    redis.hmset(key, hash, cb);
  }

  function cache(src, cacheOpts) {
    debug('cache init ' + key + (cacheOpts && cacheOpts.writeThru ? ' (writeThru)' : ''));
    var srcGet = src.get;
    var srcPut = src.put;

    // interpose cachedGet on src.get
    src.get = function cachedGet(options, cb) {
      if (typeof options === 'function') { cb = options; options = {}; }
      get(options, function(err, cachedFiles) {
        if (err) return cb(err);
        if (!options.fromSource && cachedFiles && (type !== 'FILE' || cachedFiles.length)) {
          debug('cache hit ' + key);
          return cb(null, cachedFiles);
        }
        debug((options.fromSource ? 'get from source ' : 'miss ') + key);
        srcGet(options, function(err, srcFiles) {
          if (err) return cb(err);

          // TODO:check for collisions during get from source
          put(srcFiles, options, function(err) {
            if (err) return cb(err);
            cb(null, srcFiles);
          });
        });
      });
    }

    // interpose cachedPut on src.put
    src.put = function cachedPut(files, options, cb) {
      if (typeof options === 'function') { cb = options; options = {}; }
      if (!cacheOpts.writable) return cb(new Error('cannot write to non-writable source'));
      debug('cachedPut ' + key);

      put(files, options, function(err) {
        if (err) return cb(err);
        if (cacheOpts.writeThru) return srcPut(files, options, cb);
        return cb();
      });
    }

    // only provide a flush function if the cache is writable and not writeThru
    // (existence of flush used by generator/update to force reload after save)
    if (cacheOpts.writable && !cacheOpts.writeThru) {

      // flush puts ALL files from cache back to source
      // TODO: remember which files were written and only flush those
      src.flush = function flush(options, cb) {
        if (typeof options === 'function') { cb = options; options = {}; }
        debug('flush ' + key);
        connect();
        get(options, function(err, cachedFiles) {
          if (err) return cb(err);
          if (cachedFiles && (type !== 'FILE' || cachedFiles.length)) {
            return srcPut(cachedFiles, options, cb);
          }
          cb();
        });
      }

    }

  }

  // redis-specific api - used for testing
  function clear(options, cb) {
    if (typeof options === 'function') { cb = options; options = {}; }
    debug('clear ' + key);
    connect();
    redis.del(key, cb);
  }

}
