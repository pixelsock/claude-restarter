"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = require("vscode");
const cp = require("child_process");
const os = require("os");
const path = require("path");

// Declare statusBarItem at file scope so we can access it in deactivate
let statusBarItem;

// Get default config file path based on OS
function getDefaultConfigPath() {
    const platform = os.platform();
    if (platform === 'darwin') {
        return path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
    } else if (platform === 'win32') {
        return path.join(os.homedir(), 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json');
    } else {
        // Default to Linux-like paths
        return path.join(os.homedir(), '.config', 'Claude', 'claude_desktop_config.json');
    }
}

function activate(context) {
    console.log('Claude Restarter extension is now active');
    
    // Register the restart command
    const restartCommand = vscode.commands.registerCommand('claude-restarter.restartClaude', () => {
        restartClaude();
    });
    
    // Register command to open Claude config file
    const openConfigCommand = vscode.commands.registerCommand('claude-restarter.openClaudeConfig', () => {
        openClaudeConfig();
    });
    
    // Register command to show Claude options menu
    const showOptionsCommand = vscode.commands.registerCommand('claude-restarter.showOptions', async () => {
        const selected = await vscode.window.showQuickPick([
            { label: "$(edit) Edit Claude Config", id: "config" },
            { label: "$(refresh) Restart Claude Desktop", id: "restart" }
        ], {
            placeHolder: "Claude Desktop Options"
        });
        
        if (selected) {
            if (selected.id === "config") {
                openClaudeConfig();
            } else if (selected.id === "restart") {
                restartClaude();
            }
        }
    });
    
    // Create status bar item
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'claude-restarter.showOptions';
    statusBarItem.text = "$(robot) Claude"; // Using robot icon as it's more similar to Claude's icon
    statusBarItem.tooltip = "Claude Desktop Options";
    statusBarItem.show();
    
    context.subscriptions.push(restartCommand, openConfigCommand, showOptionsCommand, statusBarItem);
    
    // Get the config file path from settings
    const config = vscode.workspace.getConfiguration('claudeRestarter');
    const defaultPath = getDefaultConfigPath();
    const configFilePath = config.get('configFilePath', defaultPath);
    
    // File watcher for the config file
    const fileWatcher = vscode.workspace.createFileSystemWatcher(configFilePath);
    
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
            const newConfigPath = vscode.workspace.getConfiguration('claudeRestarter').get('configFilePath', defaultPath);
            if (newConfigPath) {
                const newFileWatcher = vscode.workspace.createFileSystemWatcher(newConfigPath);
                newFileWatcher.onDidChange(() => {
                    vscode.window.showInformationMessage('Claude config file saved, restarting Claude...');
                    restartClaude();
                });
                context.subscriptions.push(newFileWatcher);
            }
        }
    });
    
    context.subscriptions.push(fileWatcher);
}

function openClaudeConfig() {
    const config = vscode.workspace.getConfiguration('claudeRestarter');
    const configFilePath = config.get('configFilePath', getDefaultConfigPath());
    
    // Open the file in VS Code
    vscode.commands.executeCommand('vscode.open', vscode.Uri.file(configFilePath));
}

function restartClaude() {
    // Get restart delay from settings
    const config = vscode.workspace.getConfiguration('claudeRestarter');
    const restartDelay = config.get('restartDelay', 2);
    
    const platform = os.platform();
    
    if (platform === 'darwin') {
        // AppleScript to quit and restart Claude (macOS only)
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
            }
            else {
                vscode.window.showInformationMessage('Claude restarted successfully');
            }
        });
    } else if (platform === 'win32') {
        // Windows commands to restart Claude
        cp.exec(`taskkill /f /im Claude.exe`, (error) => {
            if (error && error.code !== 128) { // 128 means process not found, which is fine
                vscode.window.showErrorMessage(`Failed to close Claude: ${error.message}`);
                return;
            }
            
            setTimeout(() => {
                cp.exec('start "" "Claude.exe"', (startError) => {
                    if (startError) {
                        vscode.window.showErrorMessage(`Failed to start Claude: ${startError.message}`);
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

function deactivate() {
    // Clean up status bar item if it exists
    if (statusBarItem) {
        statusBarItem.dispose();
    }
}
//# sourceMappingURL=extension.js.map