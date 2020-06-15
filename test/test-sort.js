/**
 * test-sort
 * copyright 2015-2020, Jürgen Leschner - github.com/jldec - MIT license
 *
**/

var test = require('tape');

var expected =
[ { path: '/index.md', text: '' },
  { path: '/A.md', text: '' },
  { path: '/Aa.md', text: '' },
  { path: '/b5.md', text: '' },
  { path: '/Ba.md', text: '' },
  { path: '/U.md', text: '' },
  { path: '/ú.md', text: '' },
  { path: '/Ú1.md', text: '' },
  { path: '/ü12.md', text: '' },
  { path: '/Ü3.md', text: '' },
  { path: '/Vz.md', text: '' },
  { path: '/Z.md', text: '' },
  { path: '/ø.md', text: '' },
  { path: '/A(A/index.', text: '' },
  { path: '/A(A/index.x', text: '' },
  { path: '/A(A/(index)', text: '' },
  { path: '/A(A/Aindex.', text: '' },
  { path: '/A(A/index/x.md', text: '' },
  { path: '/sortmetoo/ 2.md', text: '' },
  { path: '/sortmetoo/22 .md', text: '' },
  { path: '/sortmetoo/22.md', text: '' },
  { path: '/ü12/file.md', text: '' },
  { path: '/zappa/alpha/booger.md', text: '' } ];

test('compare sorted file lists', { timeout:500 }, function(t) {
  t.plan(7);

  var sourceFs = require('pub-src-fs')( { path:__dirname + '/sortme', depth:5 } );
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
            t.error(err);
            sourceRedis.unref();
          });
        });
      });
    });
  });
});
