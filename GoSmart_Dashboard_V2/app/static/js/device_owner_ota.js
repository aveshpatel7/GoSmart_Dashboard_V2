/* Go Smart device owner + OTA selector enhancement v4.
   Lightweight: no DOM-wide MutationObserver, no select rebuild loop. */
(function(){
  const directory=new Map();
  const SELECT_IDS=['controlNode','diagNode','metaNode','otaNode'];
  let syncing=false;

  function txt(v){return String(v??'').trim()}
  function token(){return sessionStorage.getItem('gosmart_admin_token')||''}
  function apiBase(){return (localStorage.getItem('gosmart_api_base')||'').replace(/\/$/,'')}
  function allNodes(){return Array.isArray(window.DATA?.all_nodes)?window.DATA.all_nodes:[]}
  function isOnline(node){return Array.isArray(window.DATA?.nodes)&&window.DATA.nodes.includes(node)}
  function localName(node){const d=window.DATA?.devices?.[node]||{},m=window.DATA?.meta?.[node]||{};return d.name||m.name||m.room||node}

  function loadCache(){
    try{
      const rows=JSON.parse(localStorage.getItem('gosmart_device_directory_cache')||'[]');
      if(Array.isArray(rows))rows.forEach(x=>{if(x?.node)directory.set(x.node,{owner:x.owner||'Owner unknown',device:x.device||x.node,backendOnline:x.backendOnline===true})});
    }catch(_){}
    window.GoSmartDeviceDirectory=directory;
  }
  function saveCache(){
    try{localStorage.setItem('gosmart_device_directory_cache',JSON.stringify([...directory.entries()].map(([node,v])=>({node,...v}))))}catch(_){}
  }

  function optionLabel(node){
    const info=directory.get(node);
    return `${info?.device||localName(node)} · ${node} · ${info?.owner||'Owner unknown'} · ${isOnline(node)?'ONLINE':'OFFLINE'}`;
  }

  function decorateSelects(){
    SELECT_IDS.forEach(id=>{
      const el=document.getElementById(id);if(!el)return;
      const old=el.value;
      if(id==='otaNode'){
        const online=allNodes().filter(isOnline);
        el.innerHTML=`<option value="ALL_ONLINE">ALL ONLINE · ${online.length} devices</option>`+online.map(n=>`<option value="${n}">${optionLabel(n)}</option>`).join('');
        el.value=online.includes(old)?old:'ALL_ONLINE';
      }else{
        const nodes=allNodes();if(!nodes.length)return;
        el.innerHTML=nodes.map(n=>`<option value="${n}">${optionLabel(n)}</option>`).join('');
        el.value=nodes.includes(old)?old:(nodes.find(isOnline)||nodes[0]);
      }
    });
  }

  function decorateDeviceTable(){
    document.querySelectorAll('#deviceTable tr').forEach(tr=>{
      const first=tr.querySelector('td');if(!first)return;
      const node=allNodes().find(n=>(first.textContent||'').includes(n));if(!node)return;
      const info=directory.get(node);if(!info)return;
      let line=first.querySelector('.device-owner-line');
      if(!line){line=document.createElement('div');line.className='device-owner-line muted';first.appendChild(line)}
      line.textContent=`Owner: ${info.owner} · ${isOnline(node)?'ONLINE':'OFFLINE'}`;
    });
  }

  function decorateTwins(){
    document.querySelectorAll('#uTwins .u-twin[data-node]').forEach(card=>{
      const node=card.dataset.node,info=directory.get(node);if(!info)return;
      let badge=card.querySelector('.owner-badge');
      if(!badge){badge=document.createElement('div');badge.className='owner-badge';card.querySelector('.u-twin-top')?.insertAdjacentElement('afterend',badge)}
      badge.textContent=`Owner: ${info.owner} · Node: ${node} · ${isOnline(node)?'ONLINE':'OFFLINE'}`;
    });
  }

  function decorate(){decorateSelects();decorateDeviceTable();decorateTwins()}

  async function syncDirectory(){
    if(syncing)return;
    const t=token(),base=apiBase();if(!t||!base){decorate();return}
    syncing=true;
    try{
      const r=await fetch(base+'/api/admin/devices?limit=500',{headers:{Authorization:'Bearer '+t},cache:'no-store'});
      if(!r.ok)throw new Error('HTTP '+r.status);
      const j=await r.json();
      const rows=Array.isArray(j)?j:(j?.data||j?.records||j?.devices||[]);
      if(Array.isArray(rows)&&rows.length){
        directory.clear();
        rows.forEach(d=>{
          const node=txt(d.node_id||d.device_id||d.id);if(!node)return;
          const o=d.owner||d.user||{};
          directory.set(node,{owner:txt(d.owner_username||d.username||d.owner_name||d.user_name||o.username||o.name||d.owner_email||d.email||o.email||'Owner unknown'),device:txt(d.name||d.device_name||d.hardware_name||node),backendOnline:d.is_online===true});
        });
        saveCache();window.GoSmartDeviceDirectory=directory;
      }
    }catch(e){console.warn('Device directory sync skipped:',e.message)}
    finally{syncing=false;decorate()}
  }

  function wrapRefresh(){
    const original=window.refresh;if(typeof original!=='function'||original.__ownerV4)return;
    const wrapped=async function(...args){const out=await original.apply(this,args);decorate();return out};
    wrapped.__ownerV4=true;window.refresh=wrapped;
  }
  function wrapFill(){
    const original=window.fillNodeSelects;if(typeof original!=='function'||original.__ownerV4)return;
    const wrapped=function(...args){const out=original.apply(this,args);decorate();return out};
    wrapped.__ownerV4=true;window.fillNodeSelects=wrapped;
  }

  function boot(){loadCache();wrapRefresh();wrapFill();decorate();syncDirectory();setInterval(()=>{wrapRefresh();wrapFill();if(token())syncDirectory();else decorate()},15000)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  document.addEventListener('click',e=>{if(e.target.closest('#uApiLogin,#uRefreshBtn'))setTimeout(syncDirectory,300)},true);
  window.goSmartSyncDeviceDirectory=syncDirectory;
  window.goSmartDecorateDeviceSelectors=decorateSelects;
})();