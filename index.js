#!/usr/bin/env node

const fs = require('fs');
const { Application } = require('./application');

const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));

new Application(config);
