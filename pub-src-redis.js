/**
 * pub-src-redis.js
 * pub-server file source using redis hash mapping path->text
 * supports non-FILE type (opaque) sources with simple key->data get/set
 * provides cache() to proxy another source
 *
 * TODO - make keys unique across pub-server instances
 * Copyright (c) 2015-2024 Jürgen Leschner - github.com/jldec - MIT license
**/
/* eslint indent: "off" */

var debug = require('debug')('pub:src-redis');

var u = require('pub-util');

module.exports = function sourceRedis(sourceOpts) {

  sourceOpts = sourceOpts || {};

  var sortEntry = sourceOpts.sortEntry || require('pub-src-fs/sort-entry')(sourceOpts);

  // allow true or 1 but coerce opts to {} to use defaults
  // NOTE: same logic in serve-sessions/serve-sessions.js
  var redisOptions = u.assign({}, sourceOpts.redisOpts);

  redisOptions.url = `redis${
      redisOptions.rediss || process.env.RCS ? 's' : ''
    }://default:${process.env.RCA || ''}@${
      redisOptions.host || process.env.RCH || 'localhost'
    }:${redisOptions.port || process.env.RCP || '6379'}`;

  delete redisOptions.host;
  delete redisOptions.port;
  delete redisOptions.rediss;
  delete redisOptions.auth_pass; // ignored - must use env var
  delete redisOptions.password;  // ignored - must use env var

  var redisLib = require('redis');

  // defer createClient until first operation - listener will block node from exiting
  var redis = null;
  var key = sourceOpts.name || sourceOpts.path || 'pub-src-redis-undefined';
  var type  = sourceOpts.type || 'FILE';

  // for upstash which limits hgetall to ~1MB
  var pageSize = sourceOpts.pageSize || 100;

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
      redis = redisLib.createClient(redisOptions);
      debug(`redis${redisOptions.rediss || process.env.RCS ? 's' : ''}`, redisOptions.host || process.env.RCH || 'localhost');
    }
  }

  // get one or all files, for all if options.stage only get files with `stage` flag.
  function get(options, cb) {
    if (typeof options === 'function') { cb = options; options = {}; }
    connect();

    if (type !== 'FILE') {
      redis.get(key, function(err, data) {
        debug('get JSON %s %s', key, err || u.size(data));
        if (err) return cb(err);
        try {
          var file = JSON.parse(data);
        }
        catch(err) {
          return cb(err);
        }
        cb(null, file);
      });
      return;
    }

    // single-file get() - returns array just like multi-file
    // unknown path results in error
    if (type === 'FILE' && options.path) {
      var path = options.path;
      redis.hget(key, options.path, function(err, data) {
        var ok = u.size(data);
        debug('get file %s %s %s', key, path, err || ok);
        if (err) return cb(err);
        if (!ok) return cb(new Error('pub-src-redis get unknown file: ' + path));
        try {
          var file = JSON.parse(data);
        }
        catch(err) {
          return cb(err);
        }
        cb(null, [ { path:path, text:file.text } ] );
      });
      return;
    }

    // get all files
    hgetall_paged(key, function(err, data) {
      debug('get files %s %s', key, err || u.size(data));
      if (err) return cb(err);

      // turn single hash object into properly sorted files array
      try {
        var files = [];

        u.each(data, function(json, path) {
          var file = JSON.parse(json);
          if (options.stage && !file.stage) return;
          files.push({ path:path, text:file.text });
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

  // NOTE: this operation is not atomic because of pagination.
  function hgetall_paged(key, cb) {
    redis.hkeys(key, function(err, keys) {
      if (err) return cb(err);

      var result = {};
      var pages = Math.ceil(keys.length / pageSize);

      // recursion is a clean way to deal with the callback chain
      // thanks cursor
      function getPage(pageIndex) {
        if (pageIndex >= pages) {
          return cb(null, result);
        }

        var start = pageIndex * pageSize;
        var end = Math.min(start + pageSize, keys.length);
        var pageKeys = keys.slice(start, end);

        redis.hmget(key, pageKeys, function(err, values) {
          debug('get files paged', key, err || pageKeys.length + '/' + keys.length);
          if (err) return cb(err);

          for (var i = 0; i < pageKeys.length; i++) {
            result[pageKeys[i]] = values[i];
          }

          getPage(pageIndex + 1);
        });
      }

      getPage(0);
    });
  }

  // put files - if options.stage || file.stage, put with `stage` flag.
  // NOTE: this operation is not atomic because of pagination.
  // TODO: option to wipe old cache in same transaction as put
  function put(files, options, cb) {
    if (typeof options === 'function') { cb = options; options = {}; }
    if (!sourceOpts.writable) return cb(new Error('cannot write to non-writable source'));
    connect();

    if (type !== 'FILE') {
      return redis.set(key, JSON.stringify(files), function(err) {
        debug('put json', key, err || u.size(files) + ' entries');
        cb(err);
      });
    }

    var totalFiles = files.length;
    var processedFiles = 0;

    // recursion is a clean way to deal with the callback chain
    // thanks cursor
    function processPage(startIndex) {
      var hash = {};
      var endIndex = Math.min(startIndex + pageSize, totalFiles);

      for (var i = startIndex; i < endIndex; i++) {
        var file = files[i];
        var data = { text: file.text };
        if (options.stage || file.stage) {
          debug('stage file', key, file.path);
          data.stage = 1;
        }
        hash[file.path] = JSON.stringify(data);
      }

      redis.hmset(key, hash, function(err) {
        debug('put files paged', key, err || u.size(hash) + '/' + totalFiles);
        if (err) return cb(err);
        processedFiles += (endIndex - startIndex);

        if (processedFiles < totalFiles) {
          processPage(endIndex);
        } else {
          cb(null);
        }
      });
    }

    processPage(0);
  }

  function cache(src, cacheOpts) {
    debug('cache init ' + key + (cacheOpts && cacheOpts.writeThru ? ' (writeThru)' : ''));
    cacheSrc = u.assign({}, src);

    // interpose cachedGet on src.get
    src.get = function cachedGet(options, cb) {
      if (typeof options === 'function') { cb = options; options = {}; }
      // if fromSource, the results of cached get() are only used to keepStagedEdits
      var getOpts = u.assign({}, options, options.fromSource ? { stage:1 } : null);
      get(getOpts, function(err, cachedFiles) {
        if (err) return cb(err);
        if (!options.fromSource && cachedFiles && (type !== 'FILE' || cachedFiles.length)) {
          debug('cache hit ' + key);
          return cb(null, cachedFiles);
        }
        // TODO: handle fromSource deletions
        debug((options.fromSource ? 'get from source ' : 'cache miss ') + key);
        cacheSrc.get(options, function(err, srcFiles) {
          if (err) return cb(err);
          if (cacheOpts.keepStagedEdits) {
            var srcFile$ = u.indexBy(srcFiles, 'path');
            u.each(cachedFiles, function(file) {
              var srcFile = srcFile$[file.path];
              if (srcFile && file.text !== srcFile.text) {
                debug('keeping staged file', key, file.path);
                srcFile.text = file.text;
                srcFile.stage = 1;
              }
            });
          }
          put(srcFiles, options, function(err) {
            if (err) return cb(err);
            cb(null, srcFiles);
          });
        });
      });
    };

    // interpose cachedPut on src.put
    // TODO: serialize to avoid concurrent put and revert
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

    // only provide commit and revert functions if the cache is writable and not writeThru
    // (existence of commit used by generator/update to force reload after save)
    if (cacheOpts.writable && !cacheOpts.writeThru) {

      src.commit = function commit(options, cb) {
        if (typeof options === 'function') { cb = options; options = {}; }
        connect();

        // commit single file (does not check if file is staged)
        if (type === 'FILE' && options.path) {
          get(options, function(err, files) {
            var commitMsg = key + ' ' + (options.commitMsg || options.path);
            debug('commit ' + commitMsg);
            if (err) return cb(err);
            // put without staging, use writeThru
            src.put(files, { writeThru:1, commitMsg:commitMsg }, cb);
          });
          return;
        }

        process.nextTick(function() { cb(new Error('pub-src-redis only single-file commit is supported.')); });
      };

      // TODO: serialize to avoid concurrent put and revert
      src.revert = function revert(options, cb) {
        if (typeof options === 'function') { cb = options; options = {}; }
        connect();

        // revert single file (does not check if file is staged)
        if (type === 'FILE' && options.path) {
          cacheSrc.get(options, function(err, files) {
            debug('revert %s %s %s', key, options.path, err || u.size(files));
            if (err) return cb(err);
            put(files, function(err) {
              if (err) return cb(err);
              // return reverted file data
              return cb(null, files);
            });
          });
          return;
        }

        process.nextTick(function() { cb(new Error('pub-src-redis only single-file revert is supported.')); });
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
