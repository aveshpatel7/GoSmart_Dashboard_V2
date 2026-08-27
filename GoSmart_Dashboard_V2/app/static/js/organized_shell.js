/* Go Smart Organized Shell v1 — presentation + reliable diagnostics action only.
   Does not replace MQTT, fan, relay, OTA or backend handlers. */
(function(){
  const $=id=>document.getElementById(id);
  const GROUPS=[
    {id:'core',label:'COMMAND',icon:'◈',pages:['overview','control','devices','inspector']},
    {id:'service',label:'SERVICE',icon:'⌁',pages:['diagnostics','ota','rf']},
    {id:'insights',label:'INSIGHTS',icon:'◒',pages:['analytics','alerts','logs']},
    {id:'admin',label:'ADMIN',icon:'⚙',pages:['ultimate','settings']}
  ];
  const labels={overview:'Overview',control:'Live Control',devices:'Devices',inspector:'Device Inspector',diagnostics:'Device Doctor',ota:'OTA / USB',rf:'RF Manager',analytics:'Analytics',alerts:'Alerts',logs:'Logs',ultimate:'Ultimate Ops',settings:'Device Meta'};
  let diagBusy=false;

  function organizeSidebar(){
    if(document.body.classList.contains('is-android'))return;
    const nav=document.querySelector('.sidebar nav');
    if(!nav||nav.dataset.organized==='1')return;
    const byPage={};
    nav.querySelectorAll('.nav[data-page]').forEach(b=>{byPage[b.dataset.page]=b});
    const frag=document.createDocumentFragment();
    GROUPS.forEach((g,gi)=>{
      const items=g.pages.map(p=>byPage[p]).filter(Boolean);
      if(!items.length)return;
      const sec=document.createElement('div');sec.className='nav-section';sec.dataset.group=g.id;
      const head=document.createElement('button');head.type='button';head.className='nav-section-head';head.innerHTML=`<span><i>${g.icon}</i>${g.label}</span><b>⌄</b>`;
      const body=document.createElement('div');body.className='nav-section-body';
      items.forEach(btn=>{btn.querySelector('span')&&(btn.querySelector('span').textContent=labels[btn.dataset.page]||btn.querySelector('span').textContent);body.appendChild(btn)});
      const stored=localStorage.getItem('gs-nav-'+g.id);
      if(stored==='closed'||(stored===null&&gi>1))sec.classList.add('collapsed');
      head.addEventListener('click',()=>{sec.classList.toggle('collapsed');localStorage.setItem('gs-nav-'+g.id,sec.classList.contains('collapsed')?'closed':'open')});
      sec.append(head,body);frag.appendChild(sec);
    });
    nav.replaceChildren(frag);nav.dataset.organized='1';
    syncNavGroups();
  }

  function syncNavGroups(){
    const active=document.querySelector('.page.active')?.id?.replace('page-','');
    if(!active)return;
    document.querySelectorAll('.nav-section').forEach(sec=>{
      const hit=!!sec.querySelector(`.nav[data-page="${active}"]`);
      sec.classList.toggle('has-active',hit);
      if(hit)sec.classList.remove('collapsed');
    });
  }

  function removeDuplicateChrome(){
    if(document.body.classList.contains('is-android'))return;
    /* Keep the three-color Pro selector; hide redundant premium theme moon button. */
    const theme=$('themeBtn');if(theme)theme.style.display='none';
    const menu=$('premiumThemeMenu');if(menu)menu.remove();
  }

  function diagButton(){
    return $('#page-diagnostics .toolbar button')||[...document.querySelectorAll('#page-diagnostics button')].find(b=>/diagnostic|doctor/i.test(b.textContent||''));
  }
  function diagStatus(){
    let s=$('diagRunStatus');
    if(s)return s;
    const toolbar=$('#page-diagnostics .toolbar');if(!toolbar)return null;
    s=document.createElement('div');s.id='diagRunStatus';s.className='diag-run-status';s.innerHTML='<span></span><b>Ready</b><small>Choose a device and run the doctor.</small>';
    toolbar.insertAdjacentElement('afterend',s);return s;
  }
  function setDiagState(kind,title,sub){
    const s=diagStatus();if(!s)return;s.dataset.state=kind;s.querySelector('b').textContent=title;s.querySelector('small').textContent=sub||'';
  }
  async function runDiagnostics(){
    if(diagBusy)return;diagBusy=true;
    const btn=diagButton();if(btn){btn.disabled=true;btn.classList.add('diag-running');btn.dataset.oldText=btn.textContent;btn.textContent='Running checks…'}
    setDiagState('busy','Running device checks…','Refreshing MQTT/dashboard data first.');
    try{
      if(typeof window.refresh==='function')await window.refresh();
      if(typeof window.renderDiagnostics!=='function')throw new Error('Diagnostics engine is not available');
      window.renderDiagnostics();
      const node=$('diagNode')?.value||'selected device';
      const now=new Date().toLocaleTimeString();
      setDiagState('ok','Diagnostics complete ✓',`${node} · checked at ${now}`);
      const panel=$('diagnosticPanel');if(panel){panel.classList.remove('diag-flash');void panel.offsetWidth;panel.classList.add('diag-flash')}
    }catch(e){setDiagState('error','Diagnostics failed',e?.message||String(e))}
    finally{diagBusy=false;if(btn){btn.disabled=false;btn.classList.remove('diag-running');btn.textContent='Run Device Doctor'}}
  }
  function wireDiagnostics(){
    const btn=diagButton();if(!btn||btn.dataset.diagWired==='1')return;
    btn.dataset.diagWired='1';btn.type='button';btn.textContent='Run Device Doctor';
    /* Capture phase makes this reliable even if older inline handlers are stale. */
    btn.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();runDiagnostics()},{capture:true});
    diagStatus();
  }

  function polishPageTitles(){
    const title=$('pageTitle');if(!title)return;
    const active=document.querySelector('.page.active')?.id?.replace('page-','');
    const map={diagnostics:['Device Doctor','One-click ESP32 health checks'],inspector:['Device Inspector','Live board state and telemetry'],ota:['Service Tools','OTA, USB flash and serial'],ultimate:['Operations','Fleet, users and backend']};
    if(map[active]){title.textContent=map[active][0];const sub=$('pageSub');if(sub)sub.textContent=map[active][1]}
  }

  function boot(){organizeSidebar();removeDuplicateChrome();wireDiagnostics();syncNavGroups();polishPageTitles()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
  /* A few delayed passes catch dynamically injected Inspector/Ultimate items, then stop. */
  [250,900,2200].forEach(ms=>setTimeout(()=>{if(document.querySelector('.sidebar nav')?.dataset.organized==='1'){
      /* If late dynamic nav items appeared, rebuild once while preserving existing buttons. */
      const nav=document.querySelector('.sidebar nav');const late=[...nav.querySelectorAll(':scope > .nav[data-page]')];if(late.length){nav.dataset.organized='0';organizeSidebar()}
    }else organizeSidebar();removeDuplicateChrome();wireDiagnostics();syncNavGroups();polishPageTitles()},ms));
  document.addEventListener('click',e=>{if(e.target.closest('.nav[data-page]'))setTimeout(()=>{syncNavGroups();polishPageTitles();wireDiagnostics()},0)},true);
  window.goSmartRunDiagnostics=runDiagnostics;
})();
