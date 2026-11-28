(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else {root.CatalogFilter=api;api.mount();}})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const normalize=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
 function matches(row,f){return Boolean((!f.q||normalize(row.search).includes(normalize(f.q)))&&(!f.type||row.type===f.type)&&(!f.talent||(row.talent||[]).includes(f.talent))&&(!f.organization||(row.organization||[]).includes(f.organization))&&(!f.from||row.date&&row.date>=f.from)&&(!f.to||row.date&&row.date<=f.to)&&(!f.setlist||row.setlist===f.setlist)&&(!f.status||row.status===f.status)&&(!f.category||row.category===f.category));}
 const validDay=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
 function pageWindow(count,requested,size=30){const pages=Math.max(1,Math.ceil(count/size)),page=Math.min(pages,Math.max(1,Number.isSafeInteger(requested)?requested:1));return {page,pages,start:(page-1)*size,end:Math.min(count,page*size)};}
 function mount(){
  if(document.querySelector('[data-karaoke-legacy]')){const target=new URL('/music/',location.origin);target.search=location.search;target.searchParams.set('category','karaoke');target.hash=location.hash;location.replace(target.href);return;}
  const form=document.getElementById('catalog-filters');if(!form)return;
  try{
   const rows=[...document.querySelectorAll('[data-filter-row]')],panels=[...document.querySelectorAll('[data-category-panel]')],tabs=[...document.querySelectorAll('[data-category]')];let category=panels[0]?.dataset.categoryPanel||'',composing=false;
   const controls=[...form.elements].filter(e=>e.name),music=document.querySelector("[data-music-library]"),pager=music?.querySelector("[data-music-pager]");let page=1;
   function restore(){
    const p=new URLSearchParams(location.search);for(const el of controls){const value=p.get(el.name)||'';el.value=el.tagName==='SELECT'?[...el.options].some(o=>o.value===value)?value:'':el.type==='date'?validDay(value)?value:'':value.slice(0,200);}
    const value=p.get('category');category=panels.some(p=>p.dataset.categoryPanel===value)?value:panels[0]?.dataset.categoryPanel||'';if(pager)page=Number(p.get('page')||1);
   }
   function url(push){const u=new URL(location.href);for(const e of controls){u.searchParams.delete(e.name);if(e.value)u.searchParams.set(e.name,e.value);}u.searchParams.delete('category');if(category&&category!==panels[0]?.dataset.categoryPanel)u.searchParams.set('category',category);if(pager){u.searchParams.delete('page');if(category==='karaoke'&&page>1)u.searchParams.set('page',page);}if(u.href!==location.href)history[push?'pushState':'replaceState']({},'',u);}
   function draw(push=false){
    const type=form.elements.namedItem('type');if(panels.some(p=>p.dataset.categoryPanel==='videos')&&type){type.disabled=category!=='videos';type.closest('label').hidden=type.disabled;}
    if(music)for(const name of ['from','to','setlist']){const input=form.elements.namedItem(name);if(input){input.disabled=category!=='karaoke';input.closest('label').hidden=input.disabled;}}
    const f=Object.fromEntries(new FormData(form));if(category)f.category=category;let count=0,total=0;
    for(const el of rows){const row=JSON.parse(el.dataset.filterRow);row.category=el.closest('[data-category-panel]')?.dataset.categoryPanel||row.category;if(!category||row.category===category)total++;el.hidden=!matches(row,f);if(!el.hidden)count++;}
    if(pager){
     const active=category==='karaoke',window=pageWindow(active?count:0,page);page=window.page;
     if(active){const matched=rows.filter(el=>!el.hidden);matched.forEach((el,i)=>{el.hidden=i<window.start||i>=window.end;});}
     pager.hidden=!active||window.pages<=1;
     pager.querySelector('[data-page-status]').textContent=window.page+' / '+window.pages+' ページ';
     pager.querySelector('[data-page-step="-1"]').disabled=window.page===1;
     pager.querySelector('[data-page-step="1"]').disabled=window.page===window.pages;
    }
    if(music)music.dataset.enhanced='true';
    for(const panel of panels)panel.hidden=panel.dataset.categoryPanel!==category;
    for(const tab of tabs){const on=tab.dataset.category===category;tab.setAttribute('aria-current',on?'page':'false');}
    for(const section of document.querySelectorAll('[data-result-section]')){
     const visible=[...section.querySelectorAll('[data-filter-row]')].filter(el=>!el.hidden).length;
     section.hidden=visible===0;
     const count=section.querySelector('[data-event-count]');if(count)count.textContent=visible+'件';
    }
    document.getElementById('catalog-status').textContent=(music||document.querySelector('[data-compact-catalog]'))?(count===total?`${count}件`:`${count}件 ／ 全${total}件`):`${count}件 ／ 登録${total}件`;document.getElementById('catalog-empty').hidden=count!==0;if(push)url(true);
   }
   for(const tab of tabs)tab.addEventListener('click',e=>{if(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;e.preventDefault();category=tab.dataset.category;page=1;draw(true);});
   if(pager)for(const button of pager.querySelectorAll('[data-page-step]'))button.addEventListener('click',()=>{page+=Number(button.dataset.pageStep);draw(true);const first=rows.find(el=>!el.hidden);if(first){const link=first.querySelector('a');if(link)link.focus({preventScroll:true});first.scrollIntoView({block:'start'});}});
   form.hidden=false;form.onsubmit=e=>e.preventDefault();form.addEventListener('compositionstart',()=>composing=true);form.addEventListener('compositionend',()=>{composing=false;page=1;draw(true);});
   form.addEventListener('input',e=>{if(!composing&&!e.isComposing){page=1;draw(true);}});form.addEventListener('change',()=>{if(!composing){page=1;draw(true);}});form.addEventListener('reset',()=>setTimeout(()=>{page=1;draw(true);},0));
   window.addEventListener('popstate',()=>{restore();draw();});document.addEventListener('catalog:refresh',()=>draw());restore();draw();url(false);
  }catch{document.getElementById('catalog-status').textContent='検索を読み込めませんでした。一覧をご利用ください。';}
 }
 return {normalize,matches,validDay,pageWindow,mount};
});
