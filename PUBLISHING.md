# Publishing the Claude Restarter Extension

This document explains how to publish new versions of the Claude Restarter extension.

## Manual Publishing

To manually publish the extension:

1. Update the version number in `package.json`
2. Package the extension: `npm run package`
3. Publish to VS Code Marketplace: `npm run publish` (requires a Personal Access Token)

## Automated Publishing via GitHub Actions

The extension is set up to automatically publish when you push a new tag with the format `v*` (e.g., `v1.1.0`).

### Requirements

- You need to add a GitHub Secret named `VSCE_PAT` containing your Visual Studio Marketplace Personal Access Token.

### Publishing Steps

1. Update the version in `package.json` (e.g., to `1.2.0`)
2. Commit your changes
3. Create and push a tag matching the version:

```bash
git tag v1.2.0
git push origin v1.2.0
```

This will trigger the GitHub Actions workflow which will:
- Package the extension
- Publish it to the VS Code Marketplace
- Create a GitHub Release with the VSIX file attached

## Getting a VS Code Marketplace PAT

1. Go to https://dev.azure.com/
2. Click on your profile in the top right and select "Personal Access Tokens"
3. Click "New Token"
4. Name it (e.g., "VS Code Extension Publishing")
5. Set the Organization to "All accessible organizations"
6. Set Scopes to "Custom defined" and ensure you have "Marketplace > Manage" permission
7. Set an appropriate expiration date
8. Click "Create" and copy the token 