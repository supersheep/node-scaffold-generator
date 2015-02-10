'use strict';

module.exports = scaffold;
function scaffold (options) {
  options = scaffold.checkOptions(options);
  return new Scaffold(options);
}

// For windows
var NO_SUPPORTED_CHARS = /[\\\/:*"<>|]/

scaffold.checkOptions = function (options) {
  options || (options = {});
  options.data || (options.data = {});
  var open = options.open || '{%';
  var close = options.close || '%}';

  if (!options.noCheckTag) {
    if (NO_SUPPORTED_CHARS.test(open) || NO_SUPPORTED_CHARS.test(close)) {
      throw new Error(
        '`open` or `close` tag is not supported in Windows.\n'
        + 'It should not contain \\ / : * " < > |\n'
        + 'Or you could set `options.noCheckTag` to `true` to ignore this error.'
      );
    }
  }

  options.renderer || (options.renderer = {
    render: function (str, data) {
      data || (data = {});
      // `ejs` confuse data with options, but there is no way out.
      // Dame it!
      data.open = open;
      data.close = close;
      return ejs.render(str, data);
    }
  });

  if (typeof options.renderer !== 'object') {
    throw new Error('`options.renderer` is not an object');
  }

  if (typeof options.renderer.render !== 'function') {
    throw new Error('`options.renderer.render` is not a function');
  }

  return options;
};


var fse = require('fs-extra');
var glob = require('glob');
var ejs = require('ejs-harmony');
var async = require('async');

var fs = require('fs');
var node_path = require('path');

// @param {Object} options
// - data {Object} the data object to be applied to the template
// - renderer {Object}
// - override {Boolean=false} whether should override existing files
// - noBackup {Boolean=false} if override an existing file, a .bak file will be saved
function Scaffold(options, callback) {
  this.options = options;
};

Scaffold.prototype.copy = function(from, to, callback) {
  if (Object(from) === from) {
    var file_map = from;
    callback = to;
    return this._copyFiles(file_map, callback);
  }

  return this._copy(from, to, callback);
};

Scaffold.prototype._getEncoding = function(path){
  var binary = this.options.binary || ".jpg,.png,.gif,.bmp,.swf,.pdf";
  binary = binary ? binary.split(",") : [];
  if(binary.indexOf(node_path.extname(path)) == -1){
    return "utf8";
  }else{
    return "binary";
  }
}

Scaffold.prototype.write = function(to, template, callback) {
  var renderer = this.options.renderer;
  var data = this.options.data;
  var self = this;
  to = renderer.render(to, data);
  this._shouldOverride(to, this.options.override, function (override) {
    if (!override) {
      return callback(null);
    }

    var content = renderer.render(template, data);
    fse.outputFile(to, content, {
      encoding: self._getEncoding(to)
    }, callback);
  });
};


Scaffold.prototype._copy = function(from, to, callback) {
  var self = this;
  fs.stat(from, function (err, stat) {
    if (err) {
      return callback(err);
    }

    if (stat.isDirectory()) {
      return self._copyDir(from, to, callback);
    }

    // copy file
    fs.stat(to, function (err, stat) {
      if (!err && stat.isDirectory()) {
        var name = node_path.basename(from);
        to = node_path.join(to, name);
      }

      // If error, maybe `to` is not exists, we just try to copy.
      return self._copyFile(from, to, callback);
    });
  });
};


Scaffold.prototype._copyDir = function(from, to, callback) {
  var self = this;
  this._globDir(from, function (err, files) {
    if (err) {
      return callback(err);
    }

    var map = {};
    files.forEach(function (file) {
      var file_from = node_path.join(from, file);
      var file_to = node_path.join(to, file);
      map[file_from] = file_to;
    });

    self._copyFiles(map, callback);
  });
};


var REGEX_FILE = /[^\/]$/;
Scaffold.prototype._globDir = function (root, callback) {
  glob('**/*', {
    cwd: root,
    dot: true,
    // Then, the dirs in `files` will end with a slash `/`
    mark: true
  }, function (err, files) {
    if (err) {
      return callback(err);
    }

    files = files.filter(REGEX_FILE.test, REGEX_FILE);
    callback(null, files);
  });
};


// @param {Array} files relative files
// @param {Object} options
// - from {path}
// - to {path}
Scaffold.prototype._copyFiles = function(file_map, callback) {
  var self = this;
  async.each(Object.keys(file_map), function (from, done) {
    var to = file_map[from];
    self._copyFile(from, to, done);

  }, function (err) {
    callback(err || null);
  });
};


// Params same as `_copyFiles`
// @param {path} from absolute path
// @param {path} to absolute path
Scaffold.prototype._copyFile = function (from, to, callback) {
  var data = this.options.data;
  var renderer = this.options.renderer;
  // substitute file name
  to = renderer.render(to, data);
  var self = this;
  self._shouldOverride(to, this.options.override, function (override) {
    if (!override) {
      return callback(null);
    }

    self._readAndTemplate(from, data, function (err, content) {
      if (err) {
        return callback(err);
      }

      fse.outputFile(to, content, {
        encoding: self._getEncoding(to)
      }, callback);
    });
  });
};


Scaffold.prototype._shouldOverride = function (file, override, callback) {
  var bak = !this.options.noBackup;
  fs.exists(file, function (exists) {
    if (exists) {
      if (override) {
        if (bak) {
          var bak_file = file + '.bak';
          // Save a '.bak' file
          return fse.copy(file, bak_file, function () {
            callback(true);
          });

        } else {
          return callback(true);
        }

      } else {
        return callback(false);
      }
    }

    callback(true);
  });
};


// Reads file and substitute with the data
Scaffold.prototype._readAndTemplate = function (path, data, callback) {
  var renderer = this.options.renderer;
  var self = this;
  fs.readFile(path, function (err, content) {
    if (err) {
      return callback(err);
    }

    if (self._getEncoding(path) == "utf8"){
      content = renderer.render(content.toString(), data);
    }

    callback(null, content);
  });
};
