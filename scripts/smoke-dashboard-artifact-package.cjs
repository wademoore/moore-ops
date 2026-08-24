const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');

const packageRoot = path.resolve('.aws-sam/build/GeneratorFunction');
const bundleCandidates = [
  path.join(packageRoot, 'dashboard-artifact/generator.js'),
  path.join(packageRoot, 'generator.js'),
];
const bundlePath = bundleCandidates.find(candidate => fs.existsSync(candidate));
assert.ok(bundlePath, 'built generator bundle is missing');

process.env.DASHBOARD_ASSET_DIR = path.join(packageRoot, 'assets-v2');
delete process.env.DASHBOARD_FIRST_DAY_ASSET_DIR;

const packagedModule = new Module(bundlePath);
packagedModule.filename = bundlePath;
packagedModule.paths = Module._nodeModulePaths(path.dirname(bundlePath));
packagedModule._compile(fs.readFileSync(bundlePath, 'utf8'), bundlePath);
assert.equal(typeof packagedModule.exports.handler, 'function', 'packaged handler export is missing');

delete process.env.ARTIFACT_BUCKET;
delete process.env.SPORTS_FEED_URL;
assert.rejects(
  packagedModule.exports.handler(),
  /ARTIFACT_BUCKET and SPORTS_FEED_URL are required/,
  'packaged handler did not begin execution',
).then(() => {
  console.log('dashboard artifact packaged-module startup: valid (module loaded and handler began execution)');
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
