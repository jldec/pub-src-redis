/**
 * pub-src-redis test-non-file
 * copyright 2015-2019, Jurgen Leschner - github.com/jldec - MIT license
 *
**/

var test = require('tape');

var data = { string: 'hello ⌘',    // include some utf-8 multi-byte
             number: Math.sqrt(2), // should challenge the de/serializer
             bool: true,
             obj: { a:1, b:'x', c:[], d:{} },
             arr: [ 1, 2, 3, 'a', 'b', 'c' ] };


test('put-get non-file data', { timeout:500 }, function(t) {
  t.plan(4);

  var sourceRedis = require('..')( { path:'test-non-file', type:'JSON', writable:1 } );

  sourceRedis.put(data, null, function(err) {
    t.error(err);

    sourceRedis.get(function(err, redisData) {
      t.error(err);

      t.deepEqual(redisData, data, 'redis vs. data');

      sourceRedis.clear(function(err) {
        t.error(err);
        sourceRedis.unref();
      });
    });
  });
});
