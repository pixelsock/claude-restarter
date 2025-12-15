"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDefaultConfigPath = getDefaultConfigPath;
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = require("vscode");
const cp = require("child_process");
const os = require("os");
const path = require("path");
const fs = require("fs");
function getDefaultConfigPath() {
    const platform = os.platform();
    if (platform === 'darwin') {
        return path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
    }
    else if (platform === 'win32') {
        return path.join(os.homedir(), 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json');
    }
    return path.join(os.homedir(), '.config', 'Claude', 'claude_desktop_config.json');
}
class ClaudeManager {
    constructor(context) {
        this.context = context;
    }
    activate() {
        this.registerCommands();
        this.createStatusBar();
        this.updateWatcher();
        this.context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('claudeRestarter.configFilePath')) {
                this.updateWatcher();
            }
        }));
    }
    registerCommands() {
        const restart = vscode.commands.registerCommand('claude-restarter.restartClaude', () => this.restartClaude());
        const openConfig = vscode.commands.registerCommand('claude-restarter.openClaudeConfig', () => this.openClaudeConfig());
        const showOptions = vscode.commands.registerCommand('claude-restarter.showOptions', () => this.showOptions());
        this.context.subscriptions.push(restart, openConfig, showOptions);
    }
    createStatusBar() {
        this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.statusBar.command = 'claude-restarter.showOptions';
        this.statusBar.text = '$(robot) Claude';
        this.statusBar.tooltip = 'Claude Desktop Options';
        this.statusBar.show();
        this.context.subscriptions.push(this.statusBar);
    }
    getConfigPath() {
        const config = vscode.workspace.getConfiguration('claudeRestarter');
        let configPath = config.get('configFilePath', getDefaultConfigPath());
        // Expand environment variables in the path
        configPath = configPath.replace(/\$\{env:(\w+)\}/g, (match, envVar) => {
            return process.env[envVar] || match;
        });
        return configPath;
    }
    updateWatcher() {
        const configPath = this.getConfigPath();
        if (this.fileWatcher) {
            this.fileWatcher.dispose();
            this.fileWatcher = undefined;
        }
        if (this.fsWatcher) {
            this.fsWatcher.close();
            this.fsWatcher = undefined;
        }
        // Use Node's fs.watch to reliably detect atomic saves and renames
        const dir = path.dirname(configPath);
        const fileName = path.basename(configPath);
        try {
            this.fsWatcher = fs.watch(dir, { persistent: true }, (eventType, changedName) => {
                if (!changedName) {
                    return;
                }
                if (changedName === fileName) {
                    const uri = vscode.Uri.file(configPath);
                    if (eventType === 'change' || eventType === 'rename') {
                        // 'rename' can be emitted on create or delete depending on atomic writes
                        this.promptRestart(uri);
                    }
                }
            });
            this.context.subscriptions.push({ dispose: () => { var _a; return (_a = this.fsWatcher) === null || _a === void 0 ? void 0 : _a.close(); } });
            console.log(`Watching Claude config: ${configPath}`);
        }
        catch (err) {
            vscode.window.showErrorMessage(`Failed to watch Claude config: ${err.message}`);
        }
    }
    promptRestart(uri) {
        console.log(`Claude config changed: ${uri.fsPath}`);
        const autoRestart = vscode.workspace.getConfiguration('claudeRestarter').get('autoRestartOnSave', false);
        if (autoRestart) {
            this.restartClaude();
            return;
        }
        vscode.window
            .showInformationMessage('Claude config saved. Restart Claude Desktop?', 'Yes', 'No')
            .then(sel => {
            if (sel === 'Yes') {
                this.restartClaude();
            }
        });
    }
    openClaudeConfig() {
        const configPath = this.getConfigPath();
        fs.access(configPath, fs.constants.F_OK, err => {
            if (err) {
                vscode.window.showErrorMessage(`Claude config not found at: ${configPath}`);
                return;
            }
            vscode.commands.executeCommand('vscode.open', vscode.Uri.file(configPath));
        });
    }
    showOptions() {
        vscode.window
            .showQuickPick([
            { label: '$(edit) Edit Claude Config', id: 'config' },
            { label: '$(refresh) Restart Claude Desktop', id: 'restart' }
        ], { placeHolder: 'Claude Desktop Options' })
            .then(selection => {
            if (!selection) {
                return;
            }
            if (selection.id === 'config') {
                this.openClaudeConfig();
            }
            else if (selection.id === 'restart') {
                this.restartClaude();
            }
        });
    }
    restartClaude() {
        const restartDelay = vscode.workspace.getConfiguration('claudeRestarter').get('restartDelay', 2);
        const platform = os.platform();
        if (platform === 'darwin') {
            const script = `if application "Claude" is running then
                tell application "Claude" to quit
                delay ${restartDelay}
            end if
            tell application "Claude" to activate`;
            cp.exec(`osascript -e '${script}'`, err => {
                if (err) {
                    vscode.window.showErrorMessage(`Failed to restart Claude: ${err.message}`);
                }
                else {
                    vscode.window.showInformationMessage('Claude restarted successfully');
                }
            });
        }
        else if (platform === 'win32') {
            cp.exec(`taskkill /f /im Claude.exe`, error => {
                if (error && error.code !== 128) {
                    vscode.window.showErrorMessage(`Failed to close Claude: ${error.message}`);
                    return;
                }
                setTimeout(() => {
                    cp.exec('start "" "Claude.exe"', startErr => {
                        if (startErr) {
                            vscode.window.showErrorMessage(`Failed to start Claude: ${startErr.message}`);
                        }
                        else {
                            vscode.window.showInformationMessage('Claude restarted successfully');
                        }
                    });
                }, restartDelay * 1000);
            });
        }
        else {
            vscode.window.showErrorMessage('Restarting Claude is only supported on macOS and Windows');
        }
    }
    dispose() {
        var _a, _b, _c;
        (_a = this.fileWatcher) === null || _a === void 0 ? void 0 : _a.dispose();
        (_b = this.fsWatcher) === null || _b === void 0 ? void 0 : _b.close();
        (_c = this.statusBar) === null || _c === void 0 ? void 0 : _c.dispose();
    }
}
let manager;
function activate(context) {
    manager = new ClaudeManager(context);
    manager.activate();
}
function deactivate() {
    manager === null || manager === void 0 ? void 0 : manager.dispose();
}
//# sourceMappingURL=extension.js.map