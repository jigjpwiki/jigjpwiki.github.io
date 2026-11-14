(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else api.mount();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const normalize=s=>String(s).normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
  function matches(row,f){return Boolean((!f.q||normalize(row.search).includes(normalize(f.q)))&&(!f.type||row.type===f.type)&&(!f.talent||row.talent.includes(f.talent))&&(!f.organization||row.organization.includes(f.organization))&&(!f.from||row.date&&row.date>=f.from)&&(!f.to||row.date&&row.date<=f.to)&&(!f.setlist||row.setlist===f.setlist));}
  function mount(){
    const form=document.getElementById('catalog-filters');if(!form)return;
    try {
      const rows=[...document.querySelectorAll('[data-filter-row]')].map(el=>({el,data:JSON.parse(el.dataset.filterRow)}));
      const params=new URLSearchParams(location.search);
      for(const name of ['talent','organization']){const el=form.elements.namedItem(name);if(el&&[...el.options].some(o=>o.value===params.get(name)))el.value=params.get(name);}
      function draw(){const f=Object.fromEntries(new FormData(form));let count=0;for(const row of rows){row.el.hidden=!matches(row.data,f);if(!row.el.hidden)count++;}document.getElementById('catalog-status').textContent=`${count}件 ／ 登録${rows.length}件`;document.getElementById('catalog-empty').hidden=count!==0;}
      form.hidden=false;form.onsubmit=e=>e.preventDefault();form.oninput=draw;form.onchange=draw;form.onreset=()=>setTimeout(draw,0);draw();
    }catch{document.getElementById('catalog-status').textContent='検索を読み込めませんでした。登録情報を一覧表示しています。';}
  }
  return {normalize,matches,mount};
});
