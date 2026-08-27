/* Go Smart device owner + OTA selector enhancement v6 — stable, non-invasive polling. */
(function(){
  const directory=new Map();
  const SELECT_IDS=['controlNode','diagNode','metaNode','otaNode'];
  let local={nodes:[],all_nodes:[],devices:{},meta:{}};
  let syncingOwners=false,syncingLocal=false,lastSignature='';
  const txt=v=>String(v??'').trim();
  const token=()=>sessionStorage.getItem('gosmart_admin_token')||'';
  const apiBase=()=>(localStorage.getItem('gosmart_api_base')||'').replace(/\/$/,'');
  const allNodes=()=>Array.isArray(local.all_nodes)?local.all_nodes:[];
  const isOnline=n=>Array.isArray(local.nodes)&&local.nodes.includes(n);
  function localName(n){const d=local.devices?.[n]||{},m=local.meta?.[n]||{};return d.name||m.name||m.room||n}
  function loadCache(){try{const a=JSON.parse(localStorage.getItem('gosmart_device_directory_cache')||'[]');if(Array.isArray(a))a.forEach(x=>x?.node&&directory.set(x.node,{owner:x.owner||'Owner unknown',device:x.device||x.node}))}catch(_){}window.GoSmartDeviceDirectory=directory}
  function saveCache(){try{localStorage.setItem('gosmart_device_directory_cache',JSON.stringify([...directory].map(([node,v])=>({node,...v}))))}catch(_){}}
  function info(n){return directory.get(n)||{owner:'Owner unknown',device:localName(n)}}
  function label(n){const i=info(n);return `${i.device||localName(n)} · ${n} · ${i.owner||'Owner unknown'} · ${isOnline(n)?'ONLINE':'OFFLINE'}`}
  function signature(){return JSON.stringify({n:local.nodes,a:local.all_nodes,o:[...directory.keys()]})}
  function setOptions(el,html,wanted,fallback){if(el.innerHTML!==html)el.innerHTML=html;if([...el.options].some(o=>o.value===wanted))el.value=wanted;else if(fallback!=null)el.value=fallback}
  function decorateSelects(){SELECT_IDS.forEach(id=>{const el=document.getElementById(id);if(!el)return;const old=el.value;if(id==='otaNode'){const ns=allNodes().filter(isOnline);const html=`<option value="ALL_ONLINE">ALL ONLINE · ${ns.length} ONLINE</option>`+ns.map(n=>`<option value="${n}">${label(n)}</option>`).join('');setOptions(el,html,old,'ALL_ONLINE');el.title='Only currently online devices are listed.'}else{const ns=allNodes();if(!ns.length)return;const html=ns.map(n=>`<option value="${n}">${label(n)}</option>`).join('');setOptions(el,html,old,ns.find(isOnline)||ns[0])}})}
  function decorateTable(){document.querySelectorAll('#deviceTable tr').forEach(tr=>{const td=tr.querySelector('td');if(!td)return;const n=allNodes().find(x=>(td.textContent||'').includes(x));if(!n)return;let line=td.querySelector('.device-owner-line');if(!line){line=document.createElement('div');line.className='device-owner-line';td.appendChild(line)}line.textContent=`${info(n).owner} · ${isOnline(n)?'ONLINE':'OFFLINE'}`})}
  function decorate(){const s=signature();if(s!==lastSignature){decorateSelects();lastSignature=s}decorateTable()}
  async function syncLocal(){if(syncingLocal||document.hidden)return;syncingLocal=true;try{const r=await fetch('/api/data',{cache:'no-store'});if(r.ok){const j=await r.json();local={nodes:j.nodes||[],all_nodes:j.all_nodes||[],devices:j.devices||{},meta:j.meta||{}};decorate()}}catch(e){console.warn('Presence sync:',e.message)}finally{syncingLocal=false}}
  async function syncOwners(){if(syncingOwners||document.hidden)return;const t=token(),base=apiBase();if(!t||!base)return;syncingOwners=true;try{const r=await fetch(base+'/api/admin/devices?limit=500',{headers:{Authorization:'Bearer '+t},cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);const j=await r.json(),rows=Array.isArray(j)?j:(j?.data||j?.records||j?.devices||[]);if(Array.isArray(rows)&&rows.length){directory.clear();rows.forEach(d=>{const n=txt(d.node_id||d.device_id||d.id);if(!n)return;const o=d.owner||d.user||{};directory.set(n,{owner:txt(d.owner_username||d.username||d.owner_name||d.user_name||o.username||o.name||d.owner_email||d.email||o.email||'Owner unknown'),device:txt(d.name||d.device_name||d.hardware_name||n)})});saveCache();lastSignature='';decorate()}}catch(e){console.warn('Owner sync:',e.message)}finally{syncingOwners=false}}
  function boot(){loadCache();syncLocal();syncOwners();setInterval(syncLocal,8000);setInterval(syncOwners,60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden){syncLocal();syncOwners()}})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  document.addEventListener('click',e=>{if(e.target.closest('#uApiLogin,#uRefreshBtn'))setTimeout(()=>{syncLocal();syncOwners()},500)},true);
  window.goSmartSyncDeviceDirectory=syncOwners;window.goSmartDecorateDeviceSelectors=decorateSelects;
})();