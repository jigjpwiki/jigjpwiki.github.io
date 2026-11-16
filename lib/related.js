'use strict';
const core = require('../assets/js/stream-core');
const relatedStreams = (talent,youtube,twitch,people=[talent]) => core.select(talent,youtube,twitch,people);
module.exports = { relatedStreams };
