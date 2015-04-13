/**
 * pub-src-redis test-non-file
 * copyright 2015, Jurgen Leschner - github.com/jldec - MIT license
 *
**/

suite('pub-src-redis test-non-file');

var assert = require('assert')
var deepdiff = require('deep-diff');
var u = require('pub-util');

var data = { string: 'hello ⌘',    // include some utf-8 multi-byte
             number: Math.sqrt(2), // should challenge the de/serializer
             bool: true,
             obj: { a:1, b:'x', c:[], d:{} },
             arr: [ 1, 2, 3, 'a', 'b', 'c' ] };


test('put-get non-file data', function(done) {

  var sourceRedis = require('..')( { path:'test-non-file', type:'JSON', writable:1 } );

  sourceRedis.put(data, null, function(err) {
    if (err) return done(err);

    sourceRedis.get(function(err, redisData) {
      if (err) return done(err);

      assertNoDiff(redisData, data, 'redis vs. data');

      sourceRedis.clear(done);
    });
  });
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
