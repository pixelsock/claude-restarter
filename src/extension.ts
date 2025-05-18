import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as os from 'os';
import * as path from 'path';

export function getDefaultConfigPath(): string {
    const platform = os.platform();
    if (platform === 'darwin') {
        return path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
    } else if (platform === 'win32') {
        return path.join(os.homedir(), 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json');
    }
    return path.join(os.homedir(), '.config', 'Claude', 'claude_desktop_config.json');
}

export function activate(context: vscode.ExtensionContext) {
    console.log('Claude Restarter extension is now active');

    // Register the restart command
    const restartCommand = vscode.commands.registerCommand('claude-restarter.restartClaude', () => {
        restartClaude();
    });
    
    context.subscriptions.push(restartCommand);

    // Get the config file path from settings
    const config = vscode.workspace.getConfiguration('claudeRestarter');
    let configFilePath = config.get<string>('configFilePath', '/Users/nick/Library/Application Support/Claude/claude_desktop_config.json');
    
    // File watcher for the config file
    let fileWatcher = vscode.workspace.createFileSystemWatcher(configFilePath);
    
    // When the file is saved, restart Claude
    fileWatcher.onDidChange(() => {
        vscode.window.showInformationMessage('Claude config file saved, restarting Claude...');
        restartClaude();
    });
    
    // Listen for configuration changes
    vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('claudeRestarter.configFilePath')) {
            // Update the file watcher with the new path
            fileWatcher.dispose();
            const newConfigPath = vscode.workspace.getConfiguration('claudeRestarter').get<string>('configFilePath', '');
            if (newConfigPath) {
                const newFileWatcher = vscode.workspace.createFileSystemWatcher(newConfigPath);
                newFileWatcher.onDidChange(() => {
                    vscode.window.showInformationMessage('Claude config file saved, restarting Claude...');
                    restartClaude();
                });
                context.subscriptions.push(newFileWatcher);
                fileWatcher = newFileWatcher;
                configFilePath = newConfigPath;
            }
        }
    });
    
    context.subscriptions.push(fileWatcher);
}

function restartClaude() {
    // Get restart delay from settings
    const config = vscode.workspace.getConfiguration('claudeRestarter');
    const restartDelay = config.get<number>('restartDelay', 2);
    
    // AppleScript to quit and restart Claude
    const appleScript = `
        if application "Claude" is running then
            tell application "Claude" to quit
            delay ${restartDelay}
        end if
        tell application "Claude" to activate
    `;
    
    // Execute the AppleScript
    cp.exec(`osascript -e '${appleScript}'`, (error) => {
        if (error) {
            vscode.window.showErrorMessage(`Failed to restart Claude: ${error.message}`);
        } else {
            vscode.window.showInformationMessage('Claude restarted successfully');
        }
    });
}

export function deactivate() {
    // Cleanup when extension is deactivated
} 