#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const appJsonPath = path.resolve(__dirname, '..', 'app.json');
const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));

const prev = parseInt(appJson.expo.ios.buildNumber || '0', 10);
const next = prev + 1;

appJson.expo.ios.buildNumber = String(next);

fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + '\n');
console.log(`buildNumber: ${prev} → ${next}`);
