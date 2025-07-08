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
    private statusBar?: vscode.StatusBarItem;

    constructor(private context: vscode.ExtensionContext) {}

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
        return config.get<string>('configFilePath', getDefaultConfigPath());
    }

    private updateWatcher() {
        const configPath = this.getConfigPath();
        if (this.fileWatcher) {
            this.fileWatcher.dispose();
        }
        this.fileWatcher = vscode.workspace.createFileSystemWatcher(configPath, false, false, false);
        this.fileWatcher.onDidChange(uri => this.promptRestart(uri));
        this.fileWatcher.onDidCreate(uri => {
            console.log(`Claude config created: ${uri.fsPath}`);
            vscode.window.showInformationMessage('Claude config file created. Watching for changes.');
        });
        this.fileWatcher.onDidDelete(() => {
            vscode.window.showWarningMessage('Claude config file deleted. Automatic restart disabled.');
        });
        this.context.subscriptions.push(this.fileWatcher);
    }

    private promptRestart(uri: vscode.Uri) {
        console.log(`Claude config changed: ${uri.fsPath}`);
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

        if (platform === 'darwin') {
            const script = `if application "Claude" is running then
                tell application "Claude" to quit
                delay ${restartDelay}
            end if
            tell application "Claude" to activate`;
            cp.exec(`osascript -e '${script}'`, err => {
                if (err) {
                    vscode.window.showErrorMessage(`Failed to restart Claude: ${err.message}`);
                } else {
                    vscode.window.showInformationMessage('Claude restarted successfully');
                }
            });
        } else if (platform === 'win32') {
            cp.exec(`taskkill /f /im Claude.exe`, error => {
                if (error && error.code !== 128) {
                    vscode.window.showErrorMessage(`Failed to close Claude: ${error.message}`);
                    return;
                }
                setTimeout(() => {
                    cp.exec('start "" "Claude.exe"', startErr => {
                        if (startErr) {
                            vscode.window.showErrorMessage(`Failed to start Claude: ${startErr.message}`);
                        } else {
                            vscode.window.showInformationMessage('Claude restarted successfully');
                        }
                    });
                }, restartDelay * 1000);
            });
        } else {
            vscode.window.showErrorMessage('Restarting Claude is only supported on macOS and Windows');
        }
    }

    public dispose() {
        this.fileWatcher?.dispose();
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
