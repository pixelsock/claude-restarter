"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = require("vscode");
const cp = require("child_process");
const os = require("os");
const path = require("path");
const fs = require("fs");

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
    
    // Log the path we're watching
    console.log(`Claude Restarter is watching for changes to: ${configFilePath}`);
    vscode.window.showInformationMessage(`Claude Restarter watching: ${configFilePath}`);
    
    // Check if the file exists
    fs.access(configFilePath, fs.constants.F_OK, (err) => {
        if (err) {
            console.error(`Claude config file not found at: ${configFilePath}`);
            vscode.window.showErrorMessage(`Claude config file not found at: ${configFilePath}. Please check your settings.`);
        } else {
            console.log(`Claude config file exists at: ${configFilePath}`);
        }
    });
    
    // Create file watcher - use glob pattern for specific file
    const fileWatcher = vscode.workspace.createFileSystemWatcher(configFilePath, false, false, false);
    
    // When the file is created (useful if it doesn't exist yet)
    fileWatcher.onDidCreate((uri) => {
        console.log(`Claude config file created: ${uri.fsPath}`);
        vscode.window.showInformationMessage('Claude config file created, will watch for changes.');
    });
    
    // When the file is changed
    fileWatcher.onDidChange((uri) => {
        console.log(`Claude config file changed: ${uri.fsPath}, restarting Claude...`);
        vscode.window.showInformationMessage('Claude config file saved, restarting Claude...');
        restartClaude();
    });
    
    // When the file is deleted
    fileWatcher.onDidDelete((uri) => {
        console.log(`Claude config file deleted: ${uri.fsPath}`);
        vscode.window.showWarningMessage('Claude config file deleted. Will no longer restart Claude automatically.');
    });
    
    // Listen for configuration changes
    vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('claudeRestarter.configFilePath')) {
            // Update the file watcher with the new path
            console.log('Configuration changed, updating file watcher...');
            fileWatcher.dispose();
            
            const newConfigPath = vscode.workspace.getConfiguration('claudeRestarter').get('configFilePath', defaultPath);
            console.log(`New config path: ${newConfigPath}`);
            
            if (newConfigPath) {
                const newFileWatcher = vscode.workspace.createFileSystemWatcher(newConfigPath, false, false, false);
                
                newFileWatcher.onDidChange((uri) => {
                    console.log(`Claude config file changed: ${uri.fsPath}, restarting Claude...`);
                    vscode.window.showInformationMessage('Claude config file saved, restarting Claude...');
                    restartClaude();
                });
                
                context.subscriptions.push(newFileWatcher);
                vscode.window.showInformationMessage(`Now watching: ${newConfigPath}`);
            }
        }
    });
    
    // Set up a manual file system check as a fallback
    const checkInterval = setInterval(() => {
        fs.stat(configFilePath, (err, currentStats) => {
            if (err) return;
            
            // Store the current stats in context
            const lastModifiedTime = context.globalState.get('configFileLastModified');
            
            if (lastModifiedTime && new Date(lastModifiedTime).getTime() !== currentStats.mtime.getTime()) {
                console.log('File change detected through manual check');
                vscode.window.showInformationMessage('Claude config file changed, restarting Claude...');
                restartClaude();
            }
            
            // Update the last modified time
            context.globalState.update('configFileLastModified', currentStats.mtime.toJSON());
        });
    }, 2000); // Check every 2 seconds
    
    // Clear interval on deactivation
    context.subscriptions.push({ dispose: () => clearInterval(checkInterval) });
    
    context.subscriptions.push(fileWatcher);
}

function openClaudeConfig() {
    const config = vscode.workspace.getConfiguration('claudeRestarter');
    const configFilePath = config.get('configFilePath', getDefaultConfigPath());
    
    // Check if the file exists before opening
    fs.access(configFilePath, fs.constants.F_OK, (err) => {
        if (err) {
            vscode.window.showErrorMessage(`Claude config file not found at: ${configFilePath}. Please check your settings.`);
            return;
        }
        
        // Open the file in VS Code
        vscode.commands.executeCommand('vscode.open', vscode.Uri.file(configFilePath));
    });
}

function restartClaude() {
    // Get restart delay from settings
    const config = vscode.workspace.getConfiguration('claudeRestarter');
    const restartDelay = config.get('restartDelay', 2);
    
    const platform = os.platform();
    console.log(`Restarting Claude on platform: ${platform}`);
    
    if (platform === 'darwin') {
        // AppleScript to quit and restart Claude (macOS only)
        const appleScript = `
            if application "Claude" is running then
                tell application "Claude" to quit
                delay ${restartDelay}
            end if
            tell application "Claude" to activate
        `;
        
        console.log('Executing AppleScript to restart Claude...');
        
        // Execute the AppleScript
        cp.exec(`osascript -e '${appleScript}'`, (error) => {
            if (error) {
                console.error(`Failed to restart Claude: ${error.message}`);
                vscode.window.showErrorMessage(`Failed to restart Claude: ${error.message}`);
            }
            else {
                console.log('Claude restarted successfully');
                vscode.window.showInformationMessage('Claude restarted successfully');
            }
        });
    } else if (platform === 'win32') {
        // Windows commands to restart Claude
        console.log('Executing Windows commands to restart Claude...');
        
        cp.exec(`taskkill /f /im Claude.exe`, (error) => {
            if (error && error.code !== 128) { // 128 means process not found, which is fine
                console.error(`Failed to close Claude: ${error.message}`);
                vscode.window.showErrorMessage(`Failed to close Claude: ${error.message}`);
                return;
            }
            
            setTimeout(() => {
                cp.exec('start "" "Claude.exe"', (startError) => {
                    if (startError) {
                        console.error(`Failed to start Claude: ${startError.message}`);
                        vscode.window.showErrorMessage(`Failed to start Claude: ${startError.message}`);
                    } else {
                        console.log('Claude restarted successfully');
                        vscode.window.showInformationMessage('Claude restarted successfully');
                    }
                });
            }, restartDelay * 1000);
        });
    } else {
        console.error('Restarting Claude is only supported on macOS and Windows');
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