'use strict';
(function(root){
  function create(people,{label='関連タレント',limit=5}={}){
    const seen=new Set(),all=(Array.isArray(people)?people:[]).filter(p=>p&&typeof p.id==='string'&&typeof p.name==='string'&&p.name&&!seen.has(p.id)&&seen.add(p.id));
    if(!all.length)return null;
    const stack=document.createElement('span');
    stack.className='avatar-stack';stack.setAttribute('role','img');
    stack.setAttribute('aria-label',label+'：'+all.map(p=>p.name).join('、'));
    const cap=Math.max(2,Math.min(8,limit)),shown=all.length>cap?cap-1:all.length;
    for(const p of all.slice(0,shown)){
      const item=document.createElement('span');item.className='avatar-stack-item';item.setAttribute('aria-hidden','true');item.dataset.talentId=p.id;
      item.textContent=[...p.name][0]||'？';
      try{
        const u=new URL(p.image,location.href);
        if(typeof p.image==='string'&&p.image&&!u.username&&!u.password&&!u.port&&(u.protocol==='https:'||u.origin===location.origin)){
          const img=document.createElement('img');img.alt='';img.loading='lazy';img.decoding='async';img.referrerPolicy='no-referrer';img.src=u.href;
          img.addEventListener('error',()=>img.remove(),{once:true});item.append(img);
        }
      }catch{}
      stack.append(item);
    }
    if(all.length>shown){const more=document.createElement('span');more.className='avatar-stack-item avatar-stack-more';more.setAttribute('aria-hidden','true');more.textContent='+'+(all.length-shown);stack.append(more);}
    return stack;
  }
  root.AvatarStack={create};
})(globalThis);
