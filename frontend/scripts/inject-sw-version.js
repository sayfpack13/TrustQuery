const fs = require('fs');
const path = require('path');

const packageJsonPath = path.resolve(__dirname, '../package.json');
const swPath = path.resolve(__dirname, '../public/service-worker.js');

// Read version from package.json
const { version } = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

// Read service worker file
let swContent = fs.readFileSync(swPath, 'utf8');

// Replace placeholder with actual version
swContent = swContent.replace(/__PROJECT_VERSION__/g, version);

// Write back to service worker file
fs.writeFileSync(swPath, swContent, 'utf8');

console.log(`Injected version ${version} into service-worker.js`); 