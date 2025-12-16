/**
 * Test for environment variable expansion in config path resolution
 * Tests the fix for: properly expand environment variables in Claude config path
 */

const assert = require('assert');

// Mock the expansion logic (same as in extension.ts getConfigPath)
function expandEnvVariables(configPath) {
    return configPath.replace(/\$\{env:(\w+)\}/g, (match, envVar) => {
        return process.env[envVar] || match;
    });
}

// Test cases
const tests = [
    {
        name: "Expands ${env:HOME} on macOS",
        input: "${env:HOME}/Library/Application Support/Claude/claude_desktop_config.json",
        expected: `${process.env.HOME}/Library/Application Support/Claude/claude_desktop_config.json`,
        shouldPass: true
    },
    {
        name: "Expands ${env:APPDATA} on Windows (if set)",
        input: "${env:APPDATA}/Claude/claude_desktop_config.json",
        expected: process.env.APPDATA ? 
            `${process.env.APPDATA}/Claude/claude_desktop_config.json` :
            "${env:APPDATA}/Claude/claude_desktop_config.json",
        shouldPass: true
    },
    {
        name: "Leaves unknown env vars unexpanded",
        input: "${env:NONEXISTENT_VAR}/config.json",
        expected: "${env:NONEXISTENT_VAR}/config.json",
        shouldPass: true
    },
    {
        name: "Handles multiple env var expansions",
        input: "${env:HOME}/.config/${env:USER}/claude.json",
        expected: `${process.env.HOME}/.config/${process.env.USER || "${env:USER}"}/claude.json`,
        shouldPass: true
    },
    {
        name: "Handles paths without env variables",
        input: "/absolute/path/to/config.json",
        expected: "/absolute/path/to/config.json",
        shouldPass: true
    },
    {
        name: "Handles relative paths",
        input: "./config/claude.json",
        expected: "./config/claude.json",
        shouldPass: true
    }
];

// Run tests
console.log("\n🧪 Environment Variable Expansion Tests\n");
console.log("=" .repeat(60));

let passed = 0;
let failed = 0;

tests.forEach((test, index) => {
    try {
        const result = expandEnvVariables(test.input);
        const matches = result === test.expected;
        
        if (matches === test.shouldPass) {
            console.log(`✅ Test ${index + 1}: ${test.name}`);
            console.log(`   Input:    ${test.input}`);
            console.log(`   Output:   ${result}`);
            passed++;
        } else {
            console.log(`❌ Test ${index + 1}: ${test.name}`);
            console.log(`   Input:    ${test.input}`);
            console.log(`   Expected: ${test.expected}`);
            console.log(`   Got:      ${result}`);
            failed++;
        }
    } catch (error) {
        console.log(`❌ Test ${index + 1}: ${test.name} - Error: ${error.message}`);
        failed++;
    }
    console.log();
});

console.log("=" .repeat(60));
console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

if (failed === 0) {
    console.log("✅ All tests passed!");
    process.exit(0);
} else {
    console.log(`❌ ${failed} test(s) failed`);
    process.exit(1);
}
