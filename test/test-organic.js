/**
 * pub-src-redis test-organic
 * copyright 2015, Jurgen Leschner - github.com/jldec - MIT license
 *
**/

suite('pub-src-redis test-organic');

var assert = require('assert')
var deepdiff = require('deep-diff');
var u = require('pub-util');
var fspath = require('path');

test('read write node-modules *.js', function(done) {

  var sourceFs = require('pub-src-fs')( { path:fspath.join(__dirname, '../node_modules'), glob:'**/*.js' } );
  var sourceRedis = require('..')( { path:'test-organic', writable:1 } );

  sourceRedis.clear(function(err) {
    if (err) return done(err);

    sourceFs.get(function(err, filesFs) {
      if (err) return done(err);

      sourceRedis.put(filesFs, null, function(err) {
        if (err) return done(err);

        // inject the same files again in reverse for good measure
        sourceRedis.put(u.clone(filesFs).reverse(), null, function(err) {
          if (err) return done(err);

          sourceRedis.get(function(err, filesRedis) {
            if (err) return done(err);

            assertNoDiff(filesRedis, filesFs, 'pub-src-redis vs. pub-src-fs');
            sourceRedis.clear(done);
          });
        });
      });
    });
  })
});


function assertNoDiff(actual, expected, msg) {
  var diff = deepdiff(actual, expected);
  var maxdiff = 5;
  if (diff) {
    assert(false, 'deepDiff ' + (msg || '') + '\n'
      + u.inspect(diff.slice(0,maxdiff), {depth:3})
      + (diff.length > maxdiff ? '\n...(truncated)' : ''));
  }
}
