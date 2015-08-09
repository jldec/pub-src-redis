/**
 * pub-src-redis test-organic
 * copyright 2015, Jurgen Leschner - github.com/jldec - MIT license
 *
**/

var test = require('tape')

var u = require('pub-util');
var fspath = require('path');

test('read write node-modules *.js', { timeout:500 }, function(t) {
  t.plan(7);

  var sourceFs = require('pub-src-fs')( { path:fspath.join(__dirname, '../node_modules'), glob:'**/*.js' } );
  var sourceRedis = require('..')( { path:'test-organic', writable:1 } );

  sourceRedis.clear(function(err) {
    t.error(err);

    sourceFs.get(function(err, filesFs) {
      t.error(err);

      sourceRedis.put(filesFs, null, function(err) {
        t.error(err);

        // inject the same files again in reverse for good measure
        sourceRedis.put(u.clone(filesFs).reverse(), null, function(err) {
          t.error(err);

          sourceRedis.get(function(err, filesRedis) {
            t.error(err);

            t.deepEqual(filesRedis, filesFs, 'pub-src-redis vs. pub-src-fs');
            sourceRedis.clear(function(err){
              t.error(err);
              sourceRedis.unref();
            });
          });
        });
      });
    });
  })
});
