(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else {root.CatalogFilter=api;api.mount();}})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const normalize=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
 function matches(row,f){return Boolean((!f.q||normalize(row.search).includes(normalize(f.q)))&&(!f.type||row.type===f.type)&&(!f.talent||(row.talent||[]).includes(f.talent))&&(!f.organization||(row.organization||[]).includes(f.organization))&&(!f.from||row.date&&row.date>=f.from)&&(!f.to||row.date&&row.date<=f.to)&&(!f.setlist||row.setlist===f.setlist)&&(!f.status||row.status===f.status)&&(!f.category||row.category===f.category));}
 const validDay=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
 function mount(){
  const form=document.getElementById('catalog-filters');if(!form)return;
  try{
   const rows=[...document.querySelectorAll('[data-filter-row]')],panels=[...document.querySelectorAll('[data-category-panel]')],tabs=[...document.querySelectorAll('[data-category]')];let category=panels[0]?.dataset.categoryPanel||'',composing=false;
   const controls=[...form.elements].filter(e=>e.name);
   function restore(){
    const p=new URLSearchParams(location.search);for(const el of controls){const value=p.get(el.name)||'';el.value=el.tagName==='SELECT'?[...el.options].some(o=>o.value===value)?value:'':el.type==='date'?validDay(value)?value:'':value.slice(0,200);}
    const value=p.get('category');category=panels.some(p=>p.dataset.categoryPanel===value)?value:panels[0]?.dataset.categoryPanel||'';
   }
   function url(push){const u=new URL(location.href);for(const e of controls){u.searchParams.delete(e.name);if(e.value)u.searchParams.set(e.name,e.value);}u.searchParams.delete('category');if(category&&category!==panels[0]?.dataset.categoryPanel)u.searchParams.set('category',category);if(u.href!==location.href)history[push?'pushState':'replaceState']({},'',u);}
   function draw(push=false){
    const type=form.elements.namedItem('type');if(panels.length&&type){type.disabled=category!=='videos';type.closest('label').hidden=type.disabled;}
    const f=Object.fromEntries(new FormData(form));if(category)f.category=category;let count=0,total=0;
    for(const el of rows){const row=JSON.parse(el.dataset.filterRow);row.category=el.closest('[data-category-panel]')?.dataset.categoryPanel||row.category;if(!category||row.category===category)total++;el.hidden=!matches(row,f);if(!el.hidden)count++;}
    for(const panel of panels)panel.hidden=panel.dataset.categoryPanel!==category;
    for(const tab of tabs){const on=tab.dataset.category===category;tab.setAttribute('aria-current',on?'page':'false');}
    for(const section of document.querySelectorAll('[data-result-section]')){
     const visible=[...section.querySelectorAll('[data-filter-row]')].filter(el=>!el.hidden).length;
     section.hidden=visible===0;
     const count=section.querySelector('[data-event-count]');if(count)count.textContent=visible+'件';
    }
    document.getElementById('catalog-status').textContent=`${count}件 ／ 登録${total}件`;document.getElementById('catalog-empty').hidden=count!==0;if(push)url(true);
   }
   for(const tab of tabs)tab.addEventListener('click',e=>{if(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;e.preventDefault();category=tab.dataset.category;draw(true);});
   form.hidden=false;form.onsubmit=e=>e.preventDefault();form.addEventListener('compositionstart',()=>composing=true);form.addEventListener('compositionend',()=>{composing=false;draw(true);});
   form.addEventListener('input',e=>{if(!composing&&!e.isComposing)draw(true);});form.addEventListener('change',()=>{if(!composing)draw(true);});form.addEventListener('reset',()=>setTimeout(()=>draw(true),0));
   window.addEventListener('popstate',()=>{restore();draw();});document.addEventListener('catalog:refresh',()=>draw());restore();draw();url(false);
  }catch{document.getElementById('catalog-status').textContent='検索を読み込めませんでした。一覧をご利用ください。';}
 }
 return {normalize,matches,validDay,mount};
});
