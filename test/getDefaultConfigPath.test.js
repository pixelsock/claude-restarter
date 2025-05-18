const assert = require('assert');
const path = require('path');
const os = require('os');
const Module = require('module');

// Stub the 'vscode' module required by extension.js
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'vscode') return {};
  return originalLoad(request, parent, isMain);
};

const { getDefaultConfigPath } = require('../extension');

function runTest(name, fn) {
  try {
    fn();
    console.log(`\u2714 ${name}`);
  } catch (err) {
    console.error(`\u2716 ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

function stubOs(platform, homeDir) {
  const originalPlatform = os.platform;
  const originalHomedir = os.homedir;
  os.platform = () => platform;
  os.homedir = () => homeDir;
  return () => {
    os.platform = originalPlatform;
    os.homedir = originalHomedir;
  };
}

runTest('returns macOS path on darwin', () => {
  const restore = stubOs('darwin', '/Users/test');
  const expected = path.join('/Users/test', 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  assert.strictEqual(getDefaultConfigPath(), expected);
  restore();
});

runTest('returns Windows path on win32', () => {
  const restore = stubOs('win32', 'C:\\Users\\test');
  const expected = path.join('C:\\Users\\test', 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json');
  assert.strictEqual(getDefaultConfigPath(), expected);
  restore();
});

runTest('returns Linux path on linux', () => {
  const restore = stubOs('linux', '/home/test');
  const expected = path.join('/home/test', '.config', 'Claude', 'claude_desktop_config.json');
  assert.strictEqual(getDefaultConfigPath(), expected);
  restore();
});
