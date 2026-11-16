'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {publicTalents,assertPrivateUnreferenced}=require('../lib/talent-publication');
test('source-free public projection preserves content and excludes private talents and references',()=>{
 const master={schemaVersion:2,organizations:[],talents:[{id:'tal-000001',displayName:'public'},{id:'tal-000002',displayName:'private'}]};
 assert.deepEqual(publicTalents(master),master);
 master.talents[1].visibility='draft';const projected=publicTalents(master);
 assert.equal(projected.talents.length,1);assert(!JSON.stringify(projected).includes('private'));
 assert.throws(()=>assertPrivateUnreferenced(master,[{event:{talentIds:['tal-000002']}}]),/Draft talent/);
 assert.doesNotThrow(()=>assertPrivateUnreferenced(master,[{event:{talentIds:['tal-000001']}}]));
});
