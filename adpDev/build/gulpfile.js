var gulp = require('gulp');
var jshint = require('gulp-jshint');
var config = require('./config');
var path = require('path');
var mergeStream = require('merge-stream');
var concat = require('gulp-concat');
var header = require('gulp-header');
var footer = require('gulp-footer');


gulp.task('build-scripts', function () {
  var scriptsDevPath = path.join(__dirname + '/../scripts');

  //var scriptsDistPath = path.join(config.DIST, '/');

  var vendorScriptsStream = gulp.src(config.vendor.scripts);
  var pluginScriptsStream = gulp.src(config.plugin.scripts)
    .pipe(jshint())
    .pipe(jshint.reporter('default'));

  return mergeStream(vendorScriptsStream, pluginScriptsStream)
    .pipe(concat(config.prodfile.scripts, {newLine: '\n;\n'}))
    .pipe(header('(function (window, document, vjs, undefined) {'))
    .pipe(footer('})(window, document, videojs);'))
    .pipe(concat(config.prodfile.scripts, {newLine: '\n;\n'}))
    .pipe(gulp.dest(scriptsDevPath))
});


gulp.task('watch', function () {// Rerun the task when a file changes
  gulp.watch(config.plugin.scripts, ['build-scripts']);
});


gulp.task('default', ['build-scripts', 'watch']);
