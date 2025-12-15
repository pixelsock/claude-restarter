"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
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
    validateConfigJSON(configPath) {
        try {
            const content = fs.readFileSync(configPath, 'utf-8');
            JSON.parse(content);
            return { valid: true };
        }
        catch (error) {
            return { valid: false, error: error.message };
        }
    }
    showNotification(message, type = 'info') {
        const shouldShowNotifications = vscode.workspace.getConfiguration('claudeRestarter').get('showDesktopNotifications', true);
        if (!shouldShowNotifications) {
            return;
        }
        if (type === 'error') {
            vscode.window.showErrorMessage(`Claude Restarter: ${message}`);
        }
        else if (type === 'warn') {
            vscode.window.showWarningMessage(`Claude Restarter: ${message}`);
        }
        else {
            vscode.window.showInformationMessage(`Claude Restarter: ${message}`);
        }
    }
    checkClaudeHealth() {
        return __awaiter(this, void 0, void 0, function* () {
            const platform = os.platform();
            const performHealthCheck = vscode.workspace.getConfiguration('claudeRestarter').get('performHealthCheck', true);
            if (!performHealthCheck) {
                return true;
            }
            yield new Promise(resolve => setTimeout(resolve, 1000));
            if (platform === 'darwin') {
                return new Promise(resolve => {
                    cp.exec('pgrep -f "Claude.app" > /dev/null', (error) => {
                        resolve(!error);
                    });
                });
            }
            else if (platform === 'win32') {
                return new Promise(resolve => {
                    cp.exec('tasklist | find /i "Claude.exe" > nul', (error) => {
                        resolve(!error);
                    });
                });
            }
            return true;
        });
    }
    activate() {
        this.registerCommands();
        this.createStatusBar();
        // Auto-discover config on first activation if needed
        const autoDiscover = vscode.workspace.getConfiguration('claudeRestarter').get('findClaudeConfigAutomatically', true);
        if (autoDiscover) {
            const configPath = this.getConfigPath();
            if (!fs.existsSync(configPath)) {
                this.findClaudeConfigAutomatically();
            }
        }
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
    findClaudeConfigAutomatically() {
        return __awaiter(this, void 0, void 0, function* () {
            const defaultPath = this.getConfigPath();
            // Try default path first
            if (fs.existsSync(defaultPath)) {
                return defaultPath;
            }
            // Search alternative locations
            const homeDir = os.homedir();
            const altPaths = [
                path.join(homeDir, 'Library/Application Support/Claude/claude_desktop_config.json'),
                path.join(homeDir, 'AppData/Roaming/Claude/claude_desktop_config.json'),
                path.join(homeDir, '.config/Claude/claude_desktop_config.json'),
                path.join(homeDir, '.claude-config.json'),
            ];
            for (const p of altPaths) {
                if (fs.existsSync(p)) {
                    console.log(`Found Claude config at: ${p}`);
                    return p;
                }
            }
            // Not found anywhere, prompt user to browse
            const picked = yield vscode.window.showOpenDialog({
                defaultUri: vscode.Uri.file(homeDir),
                filters: { 'Claude Config': ['json'] },
                canSelectFiles: true,
                openLabel: 'Select Claude Config File',
            });
            if (picked && picked[0]) {
                const foundPath = picked[0].fsPath;
                // Save user's choice to settings
                vscode.workspace.getConfiguration('claudeRestarter').update('configFilePath', foundPath, vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage(`Claude config saved to settings: ${foundPath}`);
                return foundPath;
            }
            return null;
        });
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
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Restarting Claude Desktop...',
                cancellable: false
            }, (progress) => __awaiter(this, void 0, void 0, function* () {
                progress.report({ increment: 0 });
                yield new Promise(resolve => {
                    const originalRestart = this.restartClaude.bind(this);
                    this.restartClaude = () => {
                        progress.report({ increment: 50 });
                        originalRestart();
                        setTimeout(() => {
                            progress.report({ increment: 100 });
                            resolve(null);
                        }, 2000);
                    };
                    this.restartClaude();
                    this.restartClaude = originalRestart;
                });
            }));
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
        const configPath = this.getConfigPath();
        // Validate config before restart
        const validation = this.validateConfigJSON(configPath);
        if (!validation.valid) {
            this.showNotification(`Config validation failed: ${validation.error}`, 'error');
            return;
        }
        if (platform === 'darwin') {
            const script = `if application "Claude" is running then
                tell application "Claude" to quit
                delay ${restartDelay}
            end if
            tell application "Claude" to activate`;
            cp.exec(`osascript -e '${script}'`, err => {
                if (err) {
                    this.showNotification(`Failed to restart Claude: ${err.message}`, 'error');
                }
                else {
                    this.checkClaudeHealth().then(healthy => {
                        if (healthy) {
                            this.showNotification('Claude restarted successfully');
                        }
                        else {
                            this.showNotification('Claude restart may have failed - app not detected', 'warn');
                        }
                    });
                }
            });
        }
        else if (platform === 'win32') {
            cp.exec(`taskkill /f /im Claude.exe`, error => {
                if (error && error.code !== 128) {
                    this.showNotification(`Failed to close Claude: ${error.message}`, 'error');
                    return;
                }
                setTimeout(() => {
                    cp.exec('start "" "Claude.exe"', startErr => {
                        if (startErr) {
                            this.showNotification(`Failed to start Claude: ${startErr.message}`, 'error');
                        }
                        else {
                            this.checkClaudeHealth().then(healthy => {
                                if (healthy) {
                                    this.showNotification('Claude restarted successfully');
                                }
                                else {
                                    this.showNotification('Claude restart may have failed - app not detected', 'warn');
                                }
                            });
                        }
                    });
                }, restartDelay * 1000);
            });
        }
        else {
            this.showNotification('Restarting Claude is only supported on macOS and Windows', 'error');
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