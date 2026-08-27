/* Go Smart device owner + OTA selector enhancement v5.
   Uses /api/data directly so online state is reliable across script scopes. */
(function(){
  const directory=new Map();
  const SELECT_IDS=['controlNode','diagNode','metaNode','otaNode'];
  let local={nodes:[],all_nodes:[],devices:{},meta:{}};
  let syncingOwners=false,syncingLocal=false;

  function txt(v){return String(v??'').trim()}
  function token(){return sessionStorage.getItem('gosmart_admin_token')||''}
  function apiBase(){return (localStorage.getItem('gosmart_api_base')||'').replace(/\/$/,'')}
  function allNodes(){return Array.isArray(local.all_nodes)?local.all_nodes:[]}
  function isOnline(node){return Array.isArray(local.nodes)&&local.nodes.includes(node)}
  function localName(node){const d=local.devices?.[node]||{},m=local.meta?.[node]||{};return d.name||m.name||m.room||node}

  function loadCache(){try{const rows=JSON.parse(localStorage.getItem('gosmart_device_directory_cache')||'[]');if(Array.isArray(rows))rows.forEach(x=>{if(x?.node)directory.set(x.node,{owner:x.owner||'Owner unknown',device:x.device||x.node})})}catch(_){}window.GoSmartDeviceDirectory=directory}
  function saveCache(){try{localStorage.setItem('gosmart_device_directory_cache',JSON.stringify([...directory.entries()].map(([node,v])=>({node,...v}))))}catch(_){}}
  function ownerInfo(node){return directory.get(node)||{owner:'Owner unknown',device:localName(node)}}
  function label(node){const i=ownerInfo(node);return `${i.device||localName(node)} · ${node} · ${i.owner||'Owner unknown'} · ${isOnline(node)?'ONLINE':'OFFLINE'}`}

  async function syncLocal(){
    if(syncingLocal)return;syncingLocal=true;
    try{const r=await fetch('/api/data',{cache:'no-store'});if(r.ok){const j=await r.json();local={nodes:j.nodes||[],all_nodes:j.all_nodes||[],devices:j.devices||{},meta:j.meta||{}}}}
    catch(e){console.warn('Local dashboard state sync skipped:',e.message)}finally{syncingLocal=false;decorateAll()}
  }

  async function syncOwners(){
    if(syncingOwners)return;const t=token(),base=apiBase();if(!t||!base)return;syncingOwners=true;
    try{const r=await fetch(base+'/api/admin/devices?limit=500',{headers:{Authorization:'Bearer '+t},cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);const j=await r.json();const rows=Array.isArray(j)?j:(j?.data||j?.records||j?.devices||[]);if(Array.isArray(rows)&&rows.length){directory.clear();rows.forEach(d=>{const node=txt(d.node_id||d.device_id||d.id);if(!node)return;const o=d.owner||d.user||{};directory.set(node,{owner:txt(d.owner_username||d.username||d.owner_name||d.user_name||o.username||o.name||d.owner_email||d.email||o.email||'Owner unknown'),device:txt(d.name||d.device_name||d.hardware_name||node)})});saveCache();window.GoSmartDeviceDirectory=directory}}
    catch(e){console.warn('Owner directory sync skipped:',e.message)}finally{syncingOwners=false;decorateAll()}
  }

  function decorateSelects(){
    SELECT_IDS.forEach(id=>{const el=document.getElementById(id);if(!el)return;const old=el.value;
      if(id==='otaNode'){
        const nodes=(local.nodes||[]).filter(n=>allNodes().includes(n));
        el.innerHTML=`<option value="ALL_ONLINE">ALL ONLINE · ${nodes.length} ONLINE</option>`+nodes.map(n=>`<option value="${n}">${label(n)}</option>`).join('');
        el.value=nodes.includes(old)?old:'ALL_ONLINE';
        el.title='Only currently online devices are listed.';
      }else{
        const nodes=allNodes();if(!nodes.length)return;
        el.innerHTML=nodes.map(n=>`<option value="${n}">${label(n)}</option>`).join('');
        el.value=nodes.includes(old)?old:(nodes.find(isOnline)||nodes[0]);
      }
    })
  }
  function decorateDeviceTable(){document.querySelectorAll('#deviceTable tr').forEach(tr=>{const first=tr.querySelector('td');if(!first)return;const node=allNodes().find(n=>(first.textContent||'').includes(n));if(!node)return;const info=ownerInfo(node);let line=first.querySelector('.device-owner-line');if(!line){line=document.createElement('div');line.className='device-owner-line muted';first.appendChild(line)}line.textContent=`Owner: ${info.owner} · ${isOnline(node)?'ONLINE':'OFFLINE'}`})}
  function decorateTwins(){document.querySelectorAll('#uTwins .u-twin[data-node]').forEach(card=>{const node=card.dataset.node,info=ownerInfo(node);let badge=card.querySelector('.owner-badge');if(!badge){badge=document.createElement('div');badge.className='owner-badge';card.querySelector('.u-twin-top')?.insertAdjacentElement('afterend',badge)}badge.textContent=`Owner: ${info.owner} · Node: ${node} · ${isOnline(node)?'ONLINE':'OFFLINE'}`})}
  function decorateAll(){decorateSelects();decorateDeviceTable();decorateTwins()}

  function wrapRefresh(){const original=window.refresh;if(typeof original!=='function'||original.__ownerV5)return;const wrapped=async function(...args){const out=await original.apply(this,args);await syncLocal();return out};wrapped.__ownerV5=true;window.refresh=wrapped}
  function wrapFill(){const original=window.fillNodeSelects;if(typeof original!=='function'||original.__ownerV5)return;const wrapped=function(...args){const out=original.apply(this,args);setTimeout(decorateSelects,0);return out};wrapped.__ownerV5=true;window.fillNodeSelects=wrapped}

  function boot(){loadCache();wrapRefresh();wrapFill();syncLocal();syncOwners();setInterval(syncLocal,5000);setInterval(syncOwners,30000)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  document.addEventListener('click',e=>{if(e.target.closest('#uApiLogin,#uRefreshBtn'))setTimeout(syncOwners,500)},true);
  window.goSmartSyncDeviceDirectory=syncOwners;window.goSmartDecorateDeviceSelectors=decorateSelects;
})();