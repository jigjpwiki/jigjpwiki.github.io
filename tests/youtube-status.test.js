'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { create } = require('../assets/js/youtube-status');
const stamp = Date.parse('2026-11-08T14:00:00Z');
const row = (id, extra = {}) => ({videoId:id,status:'live',type:'stream',date:new Date(stamp).toISOString(),...extra});
function fixture(response) {
 let time=stamp,calls=[]; const map=new Map();
 const storage={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)};
 const request=async url=>{if(url==='data/youtube_client.json')return {ok:true,json:async()=>({apiKey:'fixture'})};calls.push(new URL(url));return response(calls.length);};
 return {make:()=>create({fetch:request,storage,now:()=>time}),calls,advance:n=>time+=n};
}
test('batches 51 candidates into two requests and excludes videos, distant reservations and old archives',async()=>{
 const f=fixture(()=>({ok:true,json:async()=>({items:[]})}));
 await f.make()([...Array.from({length:51},(_,i)=>row(String(i))),row('video',{type:'video'}),row('future',{status:'upcoming',date:new Date(stamp+3600000).toISOString()}),row('old',{status:'archive',date:new Date(stamp-86400000).toISOString()})]);
 assert.equal(f.calls.length,2);assert.equal(f.calls[0].searchParams.get('id').split(',').length,50);
});
test('ended status survives reloads and JSON refreshes without additional calls',async()=>{
 const f=fixture(()=>({ok:true,json:async()=>({items:[{id:'a',snippet:{liveBroadcastContent:'none'},liveStreamingDetails:{actualEndTime:new Date(stamp).toISOString()}}]})}));
 assert.equal((await f.make()([row('a')]))[0].status,'archive');
 assert.equal((await f.make()([row('a')]))[0].status,'archive');assert.equal(f.calls.length,1);
});
test('live cache expires after two minutes, then updates actual start time',async()=>{
 const f=fixture(()=>({ok:true,json:async()=>({items:[{id:'a',snippet:{liveBroadcastContent:'live'},liveStreamingDetails:{actualStartTime:new Date(stamp).toISOString()}}]})}));const check=f.make();
 await check([row('a')]);await check([row('a')]);assert.equal(f.calls.length,1);
 f.advance(120001);assert.equal((await check([row('a')]))[0].status,'live');assert.equal(f.calls.length,2);
});
test('API errors keep JSON data and back off for ten minutes',async()=>{
 const f=fixture(()=>({ok:false,status:403}));const check=f.make();
 assert.equal((await check([row('a')]))[0].status,'live');await check([row('a')]);assert.equal(f.calls.length,1);
 f.advance(600001);await check([row('a')]);assert.equal(f.calls.length,2);
});
