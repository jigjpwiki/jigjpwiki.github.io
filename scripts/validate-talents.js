'use strict';
const { loadTalents } = require('../lib/talents');
const master = loadTalents();
console.log(`Talent master valid: ${master.talents.length} talents; ${master.organizations.length} organizations`);
