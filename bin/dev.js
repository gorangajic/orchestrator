#!/usr/bin/env node
const path = require('path');
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.OCLIF_TS_NODE = '1';
process.env.OCLIF_COMMANDS_PATH = path.join(__dirname, '..', 'src', 'commands');
require('ts-node/register');
const { run } = require('../src/index.ts');
run().then(undefined, require('@oclif/core/handle'));
