'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {loadTalents}=require('../lib/talents');const {loadCatalog,publicCatalog}=require('../lib/catalog');
const {loadEvents,validateEvents,projectEvents}=require('../lib/feature-data');const {timeLabel,eventPage}=require('../lib/feature-pages');
const t=loadTalents(),c=publicCatalog(loadCatalog(t));const model=()=>{const m=loadEvents(t,c);return {media:structuredClone(m.media),events:structuredClone({schemaVersion:1,events:m.events})};};
const check=m=>validateEvents(t,c,m.media,m.events);
const bad=mutate=>{const m=model();mutate(m);assert.throws(()=>check(m));};
test('verified events use performer/profile links and actual broadcast ID without changing anniversaries',()=>{const m=model();assert.equal(m.events.events.length,2);assert.equal(m.events.events[0].talentIds.length,8);assert.equal(m.events.events[1].type,'special');assert.equal(m.media.videos[0].youtubeId,'-kR7Kqqy6Vs');assert.equal(check(m).events[1].timing,'actual');});
test('event and media validation rejects dangling IDs, duplicate videos, unsafe URLs, evidence/registry gaps and reversed periods',()=>{
 bad(m=>m.events.events[0].talentIds=['tal-999999']);bad(m=>m.events.events[0].groupIds=['group-999999']);bad(m=>m.events.events[0].organizerIds=['org-999999']);bad(m=>m.events.events[0].videoIds=['abcdefghijk']);bad(m=>m.media.videos.push(structuredClone(m.media.videos[0])));bad(m=>m.events.events[0].announcementUrl='javascript:alert(1)');bad(m=>m.events.events[0].announcementUrl='https://example.com/?token=private');bad(m=>m.events.events[0].sourceRefs=['src-missing']);bad(m=>m.events.events[0].ends.value='2020-01-01T00:00:00Z');bad(m=>m.events.events[0].privateNotes='secret');
 const m=model();assert.throws(()=>validateEvents(t,c,m.media,m.events,{version:1,issued:[]}),/unissued/);
});
test('relay slots support distinct performers, unknown times, archive links and validate against event period',()=>{
 const m=model(),e=m.events.events[1];e.type='relay';const slot={id:'slot-000001',title:'出演枠',starts:{precision:'unknown',value:null},ends:{precision:'unknown',value:null},talentIds:e.talentIds,videoIds:e.videoIds,streamUrls:[],sourceRefs:e.sourceRefs};e.slots=[slot,{...structuredClone(slot),id:'slot-000002',talentIds:[t.talents[0].id]}];assert.equal(check(m).events[1].slots.length,2);
 slot.starts={precision:'instant',value:'2020-01-01T00:00:00Z'};assert.throws(()=>check(m),/outside/);
});
test('unknown/month/date times do not imply midnight, JST is explicit, draft sources never enter public projection',()=>{
 assert.match(timeLabel({precision:'instant',value:'2026-12-31T15:00:00Z'}),/2027\/01\/01.*00:00.*JST/);assert.match(timeLabel({precision:'date',value:'2026-12-26'}),/時刻未定/);assert.match(timeLabel({precision:'month',value:'2026-12'}),/日付未定/);assert.match(timeLabel({precision:'unknown',value:null}),/未定/);
 const m=model();m.events.events[1].visibility='draft';const data=projectEvents(check(m));assert.equal(data.events.length,1);assert.equal(data.videos.length,0);assert(!data.sources.some(s=>s.id==='src-event-awa-reveal'));
});
test('event pages escape untrusted text, retain availability history and have real internal destinations',()=>{const m=model(),e=m.events.events[1];e.title='<script>bad()</script>';m.media.videos[0].availability='unavailable';const data=projectEvents(check(m));const html=eventPage(e,t,data);assert.doesNotMatch(html,/<script>bad/);assert.match(html,/&lt;script&gt;/);assert.match(html,/現在の視聴不可/);assert.match(html,/\/talents\/tal-000036\//);});
