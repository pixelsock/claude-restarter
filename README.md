# Claude Restarter

A VS Code extension that automatically restarts the Claude desktop application when you save the Claude configuration file. Works on macOS and Windows.

## Features

- Prompts to restart Claude when you save the configuration file
- Provides a command to manually restart Claude
- Status bar icon with quick access to Claude options
- Edit Claude's configuration file directly from VS Code
- Cross-platform support (macOS and Windows)

## Installation

Install from the VS Code Marketplace or download and install the .vsix file manually.

## Configuration

The extension provides the following settings:

- `claudeRestarter.configFilePath`: The path to your Claude desktop configuration file. Defaults to the standard location based on your operating system.
- `claudeRestarter.restartDelay`: Delay in seconds between quitting and restarting Claude. Default is 2 seconds.

## Usage

1. The extension automatically watches for changes to the Claude configuration file.
2. When the file is saved, you'll be prompted if you want to restart Claude.
3. Click the Claude icon in the status bar to access quick options:
   - Edit Claude Config - Opens the Claude configuration file in VS Code
   - Restart Claude Desktop - Manually restarts the Claude application

## Platform Support

- **macOS**: Uses AppleScript to restart Claude
- **Windows**: Uses Windows commands to terminate and restart the Claude process

## License

MIT