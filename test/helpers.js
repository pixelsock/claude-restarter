const fs = require('fs');
const vm = require('vm');
const path = require('path');

function loadExtension(mocks = {}, extras = {}) {
  const Module = require('module');
  const originalLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) {
      return mocks[request];
    }
    return originalLoad(request, parent, isMain);
  };

  const filePath = path.join(__dirname, '..', 'extension.js');
  const code = fs.readFileSync(filePath, 'utf8') +
    '\nmodule.exports.getDefaultConfigPath = getDefaultConfigPath;' +
    '\nmodule.exports.openClaudeConfig = openClaudeConfig;' +
    '\nmodule.exports.restartClaude = restartClaude;';
  const script = new vm.Script(code, { filename: 'extension.js' });
  const module = { exports: {} };
  const context = {
    console,
    module,
    exports: module.exports,
    require: Module.createRequire(filePath),
    __dirname: path.dirname(filePath),
    __filename: filePath,
    ...extras
  };
  script.runInNewContext(context);
  Module._load = originalLoad;
  return module.exports;
}

module.exports = { loadExtension };
