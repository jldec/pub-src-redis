/**
 * pub-src-redis test-organic
 * copyright 2015-2019, Jurgen Leschner - github.com/jldec - MIT license
 *
**/

var test = require('tape');

var u = require('pub-util');
var fspath = require('path');

test('read write node-modules *.js', { timeout:5000 }, function(t) {

  var sourceFs = require('pub-src-fs')( { path:fspath.join(__dirname, '../node_modules'), glob:'**/*.js' } );
  var sourceRedis = require('..')( { path:'test-organic', writable:1 } );

  sourceRedis.clear(function(err) {
    t.error(err);

    sourceFs.get(function(err, filesFs) {
      t.error(err);

      sourceRedis.put(filesFs, null, function(err) {
        t.error(err);

        sourceRedis.get(function(err, filesRedis) {
          t.error(err);

          t.equal(filesRedis.length, filesFs.length, 'pub-src-redis vs. pub-src-fs');

          u.each(filesFs, function(file, idx) {
            t.equal(file.path, filesRedis[idx].path, file.path);
            t.equal(u.size(file.text), u.size(filesRedis[idx].text), 'file size');
            t.equal(file.text, filesRedis[idx].text, 'file data');
          });

          sourceRedis.clear(function(err){
            t.error(err);
            sourceRedis.unref();
            t.end();
          });
        });
      });
    });
  });
});
