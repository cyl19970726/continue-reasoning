#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');

// Get the directory where this script is located
const scriptDir = __dirname;
const startFile = path.join(scriptDir, 'packages', 'agents', 'start.ts');

// Run tsx with the start file using npx
const child = spawn('npx', ['tsx', startFile, ...process.argv.slice(2)], {
  stdio: 'inherit',
  cwd: scriptDir
});

child.on('exit', (code) => {
  process.exit(code || 0);
});