/**
 * test-flush-put-get
 * Copyright (c) 2015-2024 Jürgen Leschner - github.com/jldec - MIT license
 *
**/

var test = require('tape');

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

test('flush-put-get', { timeout:500 }, function(t) {

  var sourceFs = require('pub-src-fs')( { path:__dirname + '/tree', glob:'**/*.txt', depth:5 } );
  var sourceRedis = require('..')( { path:'test', writable:1 } );

  sourceRedis.clear(function(err) {
    t.error(err);

    sourceFs.get(function(err, filesFs) {
      t.error(err);

      // console.log(filesFs);
      t.deepEqual(filesFs, expected);

      sourceRedis.put(filesFs.reverse(), function(err) {
        t.error(err);

        sourceRedis.get(function(err, filesRedis) {
          t.error(err);

          // console.log(filesRedis);

          t.deepEqual(filesRedis, expected);
          sourceRedis.clear(function(err){
            t.end(err);
            sourceRedis.unref();
          });
        });
      });
    });
  });
});


test('flush-put-put-etc.-get', { timeout:500 }, function(t) {

  var sourceFs = require('pub-src-fs')( { path:__dirname + '/tree', glob:'**/*.txt', depth:5 } );
  var sourceRedis = require('..')( { path:'test2', writable:1 } );

  sourceRedis.clear(function(err) {
    t.error(err);

    sourceFs.get(function(err, filesFs) {
      t.error(err);

      t.deepEqual(filesFs, expected);

      var getAndTest = u.after(filesFs.length, function() {
        sourceRedis.get(function(err, filesRedis) {
          t.error(err);

          t.deepEqual(filesRedis, expected);
          sourceRedis.clear(function(err){
            t.end(err);
            sourceRedis.unref();
          });
        });
      });

      u.each(filesFs, function(file) {
        sourceRedis.put([file], function(err) {
          t.error(err);

          getAndTest();
        });
      });
    });
  });
});
