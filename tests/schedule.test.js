'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { dateKey, time, dates, link } = require('../assets/js/schedule');

test('JST date and time across UTC midnight and year boundary', () => {
  assert.equal(dateKey('2026-12-31T16:30:00Z'), '2027-01-01');
  assert.equal(time('2026-12-31T16:30:00Z'), '01:30');
  const days = dates(new Date('2026-12-31T16:30:00Z'));
  assert.equal(days.length, 9);
  assert.equal(days[0].key, '2026-12-29');
  assert.equal(days[3].key, '2027-01-01');
  assert.equal(days[8].key, '2027-01-06');
});
test('reject active, deceptive and off-platform links', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,test', 'http://youtube.com/', 'https://youtube.com.evil.test/', 'https://user:pass@youtube.com/', 'https://example.test/']) assert.equal(link(url, 'youtube'), null);
  assert.equal(link('https://www.twitch.tv/videos/123', 'twitch'), 'https://www.twitch.tv/videos/123');
});
