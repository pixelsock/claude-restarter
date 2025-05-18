const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { loadExtension } = require('./helpers');

function createVSCodeMock(configFilePath, restartDelay) {
  const mock = {
    window: {
      infoMessages: [],
      errorMessages: [],
      createStatusBarItem: () => ({ showCalled: false, show() { this.showCalled = true; }, dispose(){} }),
      showInformationMessage: function(msg){ this.infoMessages.push(msg); return Promise.resolve(); },
      showErrorMessage: function(msg){ this.errorMessages.push(msg); }
    },
    workspace: {
      watched: null,
      changeConfigCb: null,
      getConfiguration: () => ({
        get: (key, def) => key === 'configFilePath' ? configFilePath : (key === 'restartDelay' ? restartDelay : def)
      }),
      createFileSystemWatcher: function(fp){ this.watched = fp; return { dispose(){}, onDidChange(){}, onDidCreate(){}, onDidDelete(){} }; },
      onDidChangeConfiguration: function(cb){ this.changeConfigCb = cb; }
    },
    commands: {
      executed: [],
      registered: [],
      executeCommand: function(...args){ this.executed.push(args); },
      registerCommand: function(name, cb){ this.registered.push(name); return {}; }
    },
    StatusBarAlignment: { Right: 0 },
    Uri: { file: p => ({ fsPath: p }) }
  };
  return mock;
}

function createFsMock(exists=true){
  return {
    constants: require('fs').constants,
    access: (_p,_m,cb)=>{ exists ? cb(null) : cb(new Error('not found')); },
    stat: (_p,cb)=>{ exists ? cb(null,{mtime:new Date()}) : cb(new Error('not found')); }
  };
}

function createCpMock(){
  const calls = [];
  return { exec: (cmd, cb)=>{ calls.push(cmd); if(cb) cb(null); }, calls };
}

test('getDefaultConfigPath on macOS', () => {
  const osMock = { platform: ()=>'darwin', homedir: ()=>'/home/test' };
  const vscode = createVSCodeMock('/tmp/config.json');
  const ext = loadExtension({ os: osMock, vscode });
  assert.strictEqual(ext.getDefaultConfigPath(), path.join('/home/test','Library','Application Support','Claude','claude_desktop_config.json'));
});

test('getDefaultConfigPath on Windows', () => {
  const osMock = { platform: ()=>'win32', homedir: ()=>'C\\Users\\Test' };
  const vscode = createVSCodeMock('C:\\Users\\Test\\config.json');
  const ext = loadExtension({ os: osMock, path, vscode });
  assert.strictEqual(ext.getDefaultConfigPath(), path.join('C\\Users\\Test','AppData','Roaming','Claude','claude_desktop_config.json'));
});

test('getDefaultConfigPath on Linux', () => {
  const osMock = { platform: ()=>'linux', homedir: ()=>'/home/test' };
  const vscode = createVSCodeMock('/tmp/config.json');
  const ext = loadExtension({ os: osMock, vscode });
  assert.strictEqual(ext.getDefaultConfigPath(), path.join('/home/test','.config','Claude','claude_desktop_config.json'));
});

test('openClaudeConfig opens existing file', async () => {
  const vscode = createVSCodeMock('/tmp/config.json');
  const fsMock = createFsMock(true);
  const ext = loadExtension({ vscode, fs: fsMock });
  await ext.openClaudeConfig();
  assert.deepStrictEqual(vscode.commands.executed[0][0], 'vscode.open');
  assert.deepStrictEqual(vscode.commands.executed[0][1].fsPath, '/tmp/config.json');
});

test('openClaudeConfig shows error when file missing', async () => {
  const vscode = createVSCodeMock('/tmp/config.json');
  const fsMock = createFsMock(false);
  const ext = loadExtension({ vscode, fs: fsMock });
  await ext.openClaudeConfig();
  assert.strictEqual(vscode.window.errorMessages.length, 1);
});

test('restartClaude on macOS executes AppleScript', () => {
  const vscode = createVSCodeMock('/tmp/config.json');
  const cpMock = createCpMock();
  const osMock = { platform: ()=>'darwin' };
  const ext = loadExtension({ vscode, os: osMock, 'child_process': cpMock });
  ext.restartClaude();
  assert.ok(cpMock.calls[0].startsWith('osascript -e'));
});

test('restartClaude on Windows executes commands', () => {
  const vscode = createVSCodeMock('/tmp/config.json');
  const cpMock = createCpMock();
  const osMock = { platform: ()=>'win32' };
  const ext = loadExtension({ vscode, os: osMock, 'child_process': cpMock }, { setTimeout: (fn)=>fn() });
  ext.restartClaude();
  assert.strictEqual(cpMock.calls.length, 2);
  assert.ok(cpMock.calls[0].includes('taskkill'));
  assert.ok(cpMock.calls[1].includes('Claude.exe'));
});

test('restartClaude on unsupported OS shows error', () => {
  const vscode = createVSCodeMock('/tmp/config.json');
  const cpMock = createCpMock();
  const osMock = { platform: ()=>'linux' };
  const ext = loadExtension({ vscode, os: osMock, 'child_process': cpMock });
  ext.restartClaude();
  assert.strictEqual(vscode.window.errorMessages.length, 1);
});


test('activate registers commands and watcher', () => {
  const vscode = createVSCodeMock('/tmp/config.json');
  const fsMock = createFsMock(true);
  const osMock = { platform: ()=>'darwin', homedir: ()=>'/home/test' };
  const ext = loadExtension({ vscode, fs: fsMock, os: osMock }, {
    setInterval: (fn)=>{ fn(); return 1; },
    clearInterval: ()=>{}
  });
  const context = { subscriptions: [], globalState: { get: ()=>null, update: ()=>{} } };
  ext.activate(context);
  assert.ok(vscode.workspace.watched.includes('config.json') || vscode.workspace.watched.endsWith('config.json'));
  assert.ok(vscode.commands.registered.includes('claude-restarter.restartClaude'));
  assert.ok(context.subscriptions.length > 0);
});
