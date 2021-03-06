var path = require('path');
var _ = require('underscore');
var Source = require('./sources/source');
var Command = require('./command');
var fs = require('fs');
var fstream = require('fstream');
var wrench = require('wrench');
var spawn = require('child_process').spawn;

// A 'Meteor' refers to a single commit (branch, tag) of a version of the core meteor
//
// They are located on disk in ~/.meteorite/meteors.
// When you install a meteor into a project, it copies everything into
// ./.meteor/meteorite to create a 'custom' version of meteor for you to install packages into.
Meteor = function(config) {

  // Config defaults
  config = config || {};
  if (config === {})
    this.defaultMeteor = true;
  
  config.git = config.git || 'https://github.com/meteor/meteor.git';
  config.keepGitDir = true;

  // Prepare source
  var root = Meteor.installRoot();
  this.source = Source.prepare(root, config);

  // TODO -- this is a bit coarse. but it avoids multiple installs for now
  this.prepared = fs.existsSync(this.source.path);
};

// download the repo + install dev_bundle
Meteor.prototype.prepare = function(fn) {
  var self = this;
  
  self.source.fetch(function() {
    self.install(fn);
  }, 'Fetching Meteor');
};

Meteor.prototype.install = function(fn) {
  var self = this;

  self.prepared = true;

  // ensure the dev_bundle is installed.
  var dev_bundle = path.join(self.source.path, 'dev_bundle');

  if (!fs.existsSync(dev_bundle)) {
    // a little hack. meteor --help installs the dev bundle before doing anything else
    console.log('Downloading Meteor development bundle...');
    var meteor = spawn('./meteor', ['--help'], {cwd: self.source.path});

    // just output the status bar
    meteor.stderr.pipe(process.stderr);
    meteor.on('exit', fn);
  } else {
    fn();
  }
};

// check that the above has happened
Meteor.prototype.ensurePrepared = function(fn) {
  if (this.prepared) {
    fn();
  } else {
    this.prepare(fn);
  }
};

// run a command using just this checked-out version of meteor
Meteor.prototype.execute = function(args, fn) {
  var self = this;
  
  self.ensurePrepared(function() {
    Command.execute(path.join(self.source.packagePath(), 'meteor'), args, fn);
  });
};

// NOTE: assumes that meteor has been fetched
Meteor.prototype.hasPackage = function(pkgName) {
  return fs.existsSync(path.join(this.source.path, 'packages', pkgName))
}

// install a downloaded meteor into a project
Meteor.prototype.installInto = function(project, fn) {
  var self = this;

  project.isMeteorInstalled(function(isMeteorInstalled) {
    if (isMeteorInstalled) {
      fn(false);
    } else {
      console.log('Install custom Meteor build...');
    
      // Blow away .meteor/meteorite because in the case of
      // an upgrade it will be present
      self.uninstallFrom(project);
      
      if (!self.source.url) {
        
        fs.symlinkSync(self.source.path, project.installRoot);
        fn(true);

      } else {
        
        wrench.mkdirSyncRecursive(project.installRoot);
        
        // Copy meteor from ~/.meteorite/meteors to ./.meteor/meteorite
        var reader = fstream.Reader(self.source.path);
        var writer = fstream.Writer(project.installRoot);
  
        // Cleanup
        writer.on('close', function() { fn(true); });
  
        // Do it already
        reader.pipe(writer);
      }
    }
  });
};

// delete a meteor install from a project if it's there.
Meteor.prototype.uninstallFrom = function(project) {
  
  fs.ensureDeletedSync(project.installRoot);
};

Meteor.prototype.toJson = function(lock) {
  return this.source.toJson(lock);
};

Meteor.prototype.equals = function(otherMeteor) {
  
  return this.source.equals(otherMeteor.source);
};

Meteor.installRoot = function() {
  return path.join(Meteorite.root(), 'meteors');
};

module.exports = Meteor;
