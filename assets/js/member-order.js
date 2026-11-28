(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.MemberOrder=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const date=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value?value:null;
 function debutDates(events){
  const dates=new Map();
  for(const e of events||[]){
   if(e.visibility!=='public'||e.type!=='debut'||e.talentIds?.length!==1||e.groupIds?.length||!Number.isInteger(e.date?.year)||e.date.year<1)continue;
   const d=date([String(e.date.year).padStart(4,'0'),String(e.date.month).padStart(2,'0'),String(e.date.day).padStart(2,'0')].join('-'));
   const id=e.talentIds[0];if(d&&(!dates.has(id)||d<dates.get(id)))dates.set(id,d);
  }
  return dates;
 }
 function membership(t,organizations,debut){
  const affiliations=t.affiliations||[];
  const current=organizations.find(o=>affiliations.some(a=>a.status==='current'&&a.organizationId===o.id));
  const former=affiliations.filter(a=>a.status==='former');
  const ended=['ended','retired'].includes(t.activityStatus?.value);
  const independent=t.agencyStatus?.value==='unaffiliated'&&!ended;
  // Former-only records retain their existing separate section; group by former agency within it.
  const previous=[...former].sort((a,b)=>(b.to||'').localeCompare(a.to||'')||(b.from||'').localeCompare(a.from||'')||organizations.findIndex(o=>o.id===a.organizationId)-organizations.findIndex(o=>o.id===b.organizationId))[0];
  const org=current||(!independent&&previous?organizations.find(o=>o.id===previous.organizationId):null);
  const section=current?organizations.indexOf(current):organizations.length+(independent?0:former.length?1:ended?2:3);
  const starts=affiliations.filter(a=>a.organizationId===org?.id&&a.status===(current?'current':'former')).map(a=>date(a.from)).filter(Boolean).sort();
  // If debut followed entry, use debut; if they were already active before entry, use entry.
  // An earlier agency history makes a missing current entry date unsafe to infer from debut.
  const joined=starts.at(-1);
  const d=joined?(debut&&debut>joined?debut:joined):(!current||!former.length?debut:null);
  return {section,agency:org?organizations.indexOf(org):organizations.length,group:current?.id||(independent?'unaffiliated':former.length?'former':ended?'ended':'unknown'),date:d||null};
 }
 function orderedPeople(master,events=[]){
  const orgs=master.organizations||[],debuts=debutDates(events);
  return (master.talents||[]).map((person,i)=>({person,i,...membership(person,orgs,debuts.get(person.id))})).sort((a,b)=>a.section-b.section||a.agency-b.agency||String(a.date||'9999-99-99').localeCompare(b.date||'9999-99-99')||a.i-b.i).map(x=>x.person);
 }
 function ranks(people){return new Map((people||[]).map((p,i)=>[p.id,i]));}
 function sortIds(ids,people){
  const rank=people instanceof Map?people:ranks(people);
  return [...(ids||[])].sort((a,b)=>(rank.get(a)??Infinity)-(rank.get(b)??Infinity));
 }
 return {debutDates,membership,orderedPeople,ranks,sortIds};
});
