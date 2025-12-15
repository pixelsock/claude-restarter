import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

export function getDefaultConfigPath(): string {
    const platform = os.platform();
    if (platform === 'darwin') {
        return path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
    } else if (platform === 'win32') {
        return path.join(os.homedir(), 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json');
    }
    return path.join(os.homedir(), '.config', 'Claude', 'claude_desktop_config.json');
}

class ClaudeManager {
    private fileWatcher?: vscode.FileSystemWatcher;
    private fsWatcher?: fs.FSWatcher;
    private statusBar?: vscode.StatusBarItem;

    constructor(private context: vscode.ExtensionContext) {}

    private validateConfigJSON(configPath: string): { valid: boolean; error?: string } {
        try {
            const content = fs.readFileSync(configPath, 'utf-8');
            JSON.parse(content);
            return { valid: true };
        } catch (error: any) {
            return { valid: false, error: error.message };
        }
    }

    private showNotification(message: string, type: 'info' | 'warn' | 'error' = 'info') {
        const shouldShowNotifications = vscode.workspace.getConfiguration('claudeRestarter').get<boolean>('showDesktopNotifications', true);
        if (!shouldShowNotifications) {
            return;
        }
        if (type === 'error') {
            vscode.window.showErrorMessage(`Claude Restarter: ${message}`);
        } else if (type === 'warn') {
            vscode.window.showWarningMessage(`Claude Restarter: ${message}`);
        } else {
            vscode.window.showInformationMessage(`Claude Restarter: ${message}`);
        }
    }

    private async checkClaudeHealth(): Promise<boolean> {
        const platform = os.platform();
        const performHealthCheck = vscode.workspace.getConfiguration('claudeRestarter').get<boolean>('performHealthCheck', true);

        if (!performHealthCheck) {
            return true;
        }

        await new Promise(resolve => setTimeout(resolve, 1000));

        if (platform === 'darwin') {
            return new Promise(resolve => {
                cp.exec('pgrep -f "Claude.app" > /dev/null', (error) => {
                    resolve(!error);
                });
            });
        } else if (platform === 'win32') {
            return new Promise(resolve => {
                cp.exec('tasklist | find /i "Claude.exe" > nul', (error) => {
                    resolve(!error);
                });
            });
        }
        return true;
    }

    public activate() {
        this.registerCommands();
        this.createStatusBar();
        this.updateWatcher();

        this.context.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('claudeRestarter.configFilePath')) {
                    this.updateWatcher();
                }
            })
        );
    }

    private registerCommands() {
        const restart = vscode.commands.registerCommand('claude-restarter.restartClaude', () => this.restartClaude());
        const openConfig = vscode.commands.registerCommand('claude-restarter.openClaudeConfig', () => this.openClaudeConfig());
        const showOptions = vscode.commands.registerCommand('claude-restarter.showOptions', () => this.showOptions());
        this.context.subscriptions.push(restart, openConfig, showOptions);
    }

    private createStatusBar() {
        this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.statusBar.command = 'claude-restarter.showOptions';
        this.statusBar.text = '$(robot) Claude';
        this.statusBar.tooltip = 'Claude Desktop Options';
        this.statusBar.show();
        this.context.subscriptions.push(this.statusBar);
    }

    private getConfigPath(): string {
        const config = vscode.workspace.getConfiguration('claudeRestarter');
        let configPath = config.get<string>('configFilePath', getDefaultConfigPath());
        
        // Expand environment variables in the path
        configPath = configPath.replace(/\$\{env:(\w+)\}/g, (match, envVar) => {
            return process.env[envVar] || match;
        });
        
        return configPath;
    }

    private updateWatcher() {
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
            this.context.subscriptions.push({ dispose: () => this.fsWatcher?.close() });
            console.log(`Watching Claude config: ${configPath}`);
        } catch (err: any) {
            vscode.window.showErrorMessage(`Failed to watch Claude config: ${err.message}`);
        }
    }

    private promptRestart(uri: vscode.Uri) {
        console.log(`Claude config changed: ${uri.fsPath}`);
        const autoRestart = vscode.workspace.getConfiguration('claudeRestarter').get<boolean>('autoRestartOnSave', false);
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

    private openClaudeConfig() {
        const configPath = this.getConfigPath();
        fs.access(configPath, fs.constants.F_OK, err => {
            if (err) {
                vscode.window.showErrorMessage(`Claude config not found at: ${configPath}`);
                return;
            }
            vscode.commands.executeCommand('vscode.open', vscode.Uri.file(configPath));
        });
    }

    private showOptions() {
        vscode.window
            .showQuickPick(
                [
                    { label: '$(edit) Edit Claude Config', id: 'config' },
                    { label: '$(refresh) Restart Claude Desktop', id: 'restart' }
                ],
                { placeHolder: 'Claude Desktop Options' }
            )
            .then(selection => {
                if (!selection) {
                    return;
                }
                if (selection.id === 'config') {
                    this.openClaudeConfig();
                } else if (selection.id === 'restart') {
                    this.restartClaude();
                }
            });
    }

    private restartClaude() {
        const restartDelay = vscode.workspace.getConfiguration('claudeRestarter').get<number>('restartDelay', 2);
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
                } else {
                    this.checkClaudeHealth().then(healthy => {
                        if (healthy) {
                            this.showNotification('Claude restarted successfully');
                        } else {
                            this.showNotification('Claude restart may have failed - app not detected', 'warn');
                        }
                    });
                }
            });
        } else if (platform === 'win32') {
            cp.exec(`taskkill /f /im Claude.exe`, error => {
                if (error && error.code !== 128) {
                    this.showNotification(`Failed to close Claude: ${error.message}`, 'error');
                    return;
                }
                setTimeout(() => {
                    cp.exec('start "" "Claude.exe"', startErr => {
                        if (startErr) {
                            this.showNotification(`Failed to start Claude: ${startErr.message}`, 'error');
                        } else {
                            this.checkClaudeHealth().then(healthy => {
                                if (healthy) {
                                    this.showNotification('Claude restarted successfully');
                                } else {
                                    this.showNotification('Claude restart may have failed - app not detected', 'warn');
                                }
                            });
                        }
                    });
                }, restartDelay * 1000);
            });
        } else {
            this.showNotification('Restarting Claude is only supported on macOS and Windows', 'error');
        }
    }

    public dispose() {
        this.fileWatcher?.dispose();
        this.fsWatcher?.close();
        this.statusBar?.dispose();
    }
}

let manager: ClaudeManager | undefined;

export function activate(context: vscode.ExtensionContext) {
    manager = new ClaudeManager(context);
    manager.activate();
}

export function deactivate() {    manager?.dispose();
}
