/**
 * test-flush-put-get
 * copyright 2015, Jurgen Leschner - github.com/jldec - MIT license
 *
**/

suite('pub-src-redis test-flush-put-get');

var assert = require('assert')
var u = require('pub-util');

var expected =
[ { path: '/-foo.txt', text: 'file some -->  ⌘ <---' },
  { path: '/1.txt', text: '' },
  { path: '/2.txt', text: '' },
  { path: '/3.txt', text: '' },
  { path: '/4.txt', text: '' },
  { path: '/5.txt', text: '' },
  { path: '/1/9.txt', text: '' },
  { path: '/2/10.txt/11.txt', text: '' },
  { path: '/2/10.txt/12.txt', text: '' },
  { path: '/2/10.txt/13/14.txt', text: '' },
  { path: '/2/10.txt/13/level-4/not-ignored.txt', text: '' },
  { path: '/f1/6.txt', text: '' },
  { path: '/f1/7.txt', text: '' },
  { path: '/f2/8.txt', text: '' } ];

test('flush-put-get', function(done) {

  var sourceFs = require('pub-src-fs')( { path:__dirname + '/tree', glob:'**/*.txt', depth:5 } );
  var sourceRedis = require('..')( { path:'test', writable:1 } );

  sourceRedis.clear(function(err) {
    if (err) return done(err);

    sourceFs.get(function(err, filesFs) {
      if (err) return done(err);
// console.log(filesFs);
      assert.deepEqual(filesFs, expected);

      sourceRedis.put(filesFs.reverse(), null, function(err) {
        if (err) return done(err);

        sourceRedis.get(function(err, filesRedis) {
          if (err) return done(err);
// console.log(filesRedis);

          assert.deepEqual(filesRedis, expected);
          sourceRedis.clear(done);
        });
      });
    });
  })
});


test('flush-put-put-etc.-get', function(done) {

  var sourceFs = require('pub-src-fs')( { path:__dirname + '/tree', glob:'**/*.txt', depth:5 } );
  var sourceRedis = require('..')( { path:'test2', writable:1 } );

  sourceRedis.clear(function(err) {
    if (err) return done(err);

    sourceFs.get(function(err, filesFs) {
      if (err) return done(err);
      assert.deepEqual(filesFs, expected);

      var getAndTest = u.after(filesFs.length, function() {
        sourceRedis.get(function(err, filesRedis) {
          if (err) return done(err);

          assert.deepEqual(filesRedis, expected);
          sourceRedis.clear(done);
        });
      })

      u.each(filesFs, function(file) {
        sourceRedis.put([file], null, function(err) {
          if (err) return done(err);
          getAndTest();
        });
      });
    });
  });
});

