'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {matches,normalize}=require('../assets/js/talent-directory');
const core=require('../assets/js/anniversary-core');
test('directory combines normalized verified aliases, current/former multi-agency and group filters',()=>{
 const p={name:'テスト',aliases:['Ｔｅｓｔ'],current:['a','b'],former:['c'],groups:['g','h']};
 assert.equal(normalize(' テスト '),'てすと');
 for(const f of [{q:'test'},{q:'てすと',organization:'b',relation:'current',group:'h'},{organization:'c',relation:'former'}])assert.equal(matches(p,f),true);
 for(const f of [{organization:'c',relation:'current'},{relation:'unknown'},{group:'missing'},{q:'internal-id'}])assert.equal(matches(p,f),false);
 assert.equal(matches({...p,current:[],former:[],groups:[]},{relation:'unknown'}),true);
 assert.equal(matches({...p,current:[],former:['c']},{relation:'former'}),true);
 assert.equal(matches({...p,current:[],former:[],unaffiliated:true},{relation:'unknown'}),false);
 assert.equal(matches({...p,current:[],former:[],unaffiliated:true},{relation:'unaffiliated'}),true);
});
test('compact calendar keeps multiple events out of cells, accessible day selection and static fallback anchors',()=>{
 const event={id:'ann-test',title:'<script>alert(1)</script>',type:'birthday',date:{year:null,month:2,day:29},recursYearly:true,countYears:false,talentIds:[],groupIds:[]};
 const m={events:[event,{...event,id:'ann-other'}],groups:[],people:[]};
 const html=core.calendar(m,'2028-02','2028-02-29',{},'2028-02-29',true);
 assert.match(html,/記念日2件/);assert.match(html,/aria-pressed="true"/);assert.doesNotMatch(html,/<script>|data-event-id/);
 assert.match(core.calendar(m,'2028-02','2028-02-29'),/href="#ann-day-2028-02-29"/);
 assert.match(core.dayDetails(m,'2028-02-29'),/&lt;script&gt;/);assert.doesNotMatch(core.dayDetails(m,'2027-02-28'),/周年|alert/);
});
test('visitor cards keep current affiliations ahead of former, unknown and safe embedded data without management fields',()=>{
 const {talentCards}=require('../lib/site-pages');const master=structuredClone(require('../data/talents.json'));
 master.talents=[{...master.talents[0],displayName:'</script><script>alert(1)</script>',affiliations:[]}];
 master.organizations[0].name='</script><img src=x onerror=alert(1)>';
 const html=talentCards(master);
 assert.match(html,/所属不明/);assert.match(html,/aria-labelledby=/);
 assert.doesNotMatch(html,/<script>alert|<img src=x|agencyStatus|activityStatus|所属履歴/);
 const encoded=html.match(/id="directory-data">(.*?)<\/script>/)[1];
 assert.equal(JSON.parse(encoded).organizations[0].name,master.organizations[0].name);
 master.talents[0].agencyStatus.value='unaffiliated';
 assert.match(talentCards(master),/無所属/);
 assert.doesNotMatch(talentCards(master),/所属不明/);
});
