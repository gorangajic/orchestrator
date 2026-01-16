#!/usr/bin/env node
const { run } = require('../dist/index.js');
run().then(undefined, require('@oclif/core/handle'));
