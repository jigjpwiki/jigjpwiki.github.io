(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.TalentDirectory = api; api.mount(); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const normalize = s => s.normalize('NFKC').toLowerCase().replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-96)).replace(/\s/g,'');
  function matches(p, f = {}) {
    return (!f.q || [p.name,...p.aliases].some(s=>normalize(s).includes(normalize(f.q)))) &&
      (!f.organization || (f.relation==='current'?p.current:f.relation==='former'?p.former:[...p.current,...p.former]).includes(f.organization)) &&
      (!f.group || p.groups.includes(f.group)) &&
      (!f.relation || (f.relation==='unknown' ? !p.current.length&&!p.former.length&&!p.unaffiliated : f.relation==='unaffiliated' ? p.unaffiliated===true : p[f.relation].length>0));
  }
  function mount() {
    const form = document.getElementById('talent-filters'); if (!form) return;
    const cards = [...document.querySelectorAll('[data-person]')].map(el=>({el,p:JSON.parse(el.dataset.person)}));
    const config = JSON.parse(document.getElementById('directory-data').textContent);
    const fields = {q:document.getElementById('talent-search'),organization:document.getElementById('talent-organization'),group:document.getElementById('talent-group'),relation:document.getElementById('talent-relation')};
    for(const [key,rows] of [['organization',config.organizations],['group',config.groups]]) for(const row of rows) fields[key].add(new Option(row.name,row.id));
    const labels = new Map(Object.values(fields).filter(el=>el.options).flatMap(el=>[...el.options].map(o=>[el.id+o.value,o.textContent])));
    function draw() {
      const f=Object.fromEntries(Object.entries(fields).map(([k,el])=>[k,el.value]));
      let n=0; for(const {el,p} of cards) { el.hidden=!matches(p,f); if(!el.hidden)n++; }
      for(const key of ['organization','group','relation']) for(const option of fields[key].options) {
        const count=cards.filter(({p})=>matches(p,{...f,[key]:option.value})).length;
        option.textContent=`${labels.get(fields[key].id+option.value)} (${count})`;
      }
      document.getElementById('talent-count').textContent=`${n}名 ／ 登録${cards.length}名`;
      document.getElementById('talent-empty').hidden=n!==0;
    }
    form.hidden=false; form.onsubmit=e=>e.preventDefault(); form.oninput=draw; form.onchange=draw;
    form.onreset=()=>setTimeout(draw,0); draw();
  }
  return {normalize,matches,mount};
});
