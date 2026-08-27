/* Go Smart Android UX v5 — Android only; no backend/MQTT overrides. */
(function(){
  if(!/Android/i.test(navigator.userAgent||'')) return;
  const $=id=>document.getElementById(id);
  document.body.classList.add('is-android');
  let lastPage='overview',lastToast='',lastToastAt=0;

  const themes={neon:'theme-neon',apple:'theme-apple',industrial:'theme-industrial'};
  function setTheme(name){
    const cls=themes[name]||themes.neon;
    Object.values(themes).forEach(c=>document.body.classList.remove(c));
    document.body.classList.add(cls);
    localStorage.setItem('gosmartAndroidTheme',name in themes?name:'neon');
    document.querySelectorAll('.android-theme-choice').forEach(b=>b.classList.toggle('active',b.dataset.theme===(name in themes?name:'neon')));
  }
  setTheme(localStorage.getItem('gosmartAndroidTheme')||'neon');

  function openPage(name){
    if(typeof window.showPage==='function') window.showPage(name);
    lastPage=name;
    document.querySelectorAll('.android-bottom-nav button[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===name));
    $('sidebar')?.classList.remove('open');
    window.scrollTo({top:0,left:0,behavior:'auto'});
    closeSheet();
  }

  function injectFanIcon(){
    const orb=$('fanOrb'); if(!orb||orb.querySelector('.fan-icon')) return;
    orb.innerHTML=`<svg class="fan-icon" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="5" fill="currentColor"/><path d="M32 7c9 0 15 7 13 14-2 7-8 9-13 11-2-7-5-15 0-25Z" fill="currentColor" opacity=".96"/><path d="M55 35c-4 8-13 10-18 5-5-5-4-11-3-16 7 2 16 4 21 11Z" fill="currentColor" opacity=".82"/><path d="M20 54c-8-4-10-13-5-18 5-5 11-4 16-3-2 7-4 16-11 21Z" fill="currentColor" opacity=".68"/></svg>`;
  }

  function injectDock(){
    if(document.querySelector('.android-bottom-nav')) return;
    const nav=document.createElement('nav');
    nav.className='android-bottom-nav android-only';nav.setAttribute('aria-label','Quick navigation');
    nav.innerHTML=`
      <button type="button" data-page="overview"><b>⌂</b><span>Home</span></button>
      <button type="button" data-page="devices"><b>▦</b><span>Devices</span></button>
      <button type="button" data-page="control"><b>◉</b><span>Control</span></button>
      <button type="button" data-page="ota"><b>⇧</b><span>Tools</span></button>
      <button type="button" data-more="1"><b>☰</b><span>More</span></button>`;
    nav.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.page)openPage(b.dataset.page);else if(b.dataset.more)openSheet()});
    document.body.appendChild(nav);
    syncDock();
  }

  function injectSheet(){
    if(document.querySelector('.android-sheet-backdrop')) return;
    const wrap=document.createElement('div');wrap.className='android-sheet-backdrop android-only';
    wrap.innerHTML=`<div class="android-sheet" role="dialog" aria-modal="true" aria-label="More options">
      <h3>Appearance & More</h3>
      <div class="android-theme-grid">
        <button class="android-theme-choice" data-theme="neon" style="--swatch:#62e8c4"><i></i>Neon</button>
        <button class="android-theme-choice" data-theme="apple" style="--swatch:#7fb0ff"><i></i>Apple Dark</button>
        <button class="android-theme-choice" data-theme="industrial" style="--swatch:#ffb34f"><i></i>Industrial</button>
      </div>
      <div class="android-more-grid">
        <button data-page="alerts">Alerts</button><button data-page="diagnostics">Device Doctor</button>
        <button data-page="rf">RF Manager</button><button data-page="analytics">Analytics</button>
        <button data-page="logs">Logs</button><button data-page="settings">Device Meta</button>
      </div>
    </div>`;
    wrap.addEventListener('click',e=>{
      if(e.target===wrap){closeSheet();return}
      const theme=e.target.closest('[data-theme]');if(theme){setTheme(theme.dataset.theme);toast('Theme changed','ok');return}
      const page=e.target.closest('[data-page]');if(page)openPage(page.dataset.page);
    });
    document.body.appendChild(wrap);
    setTheme(localStorage.getItem('gosmartAndroidTheme')||'neon');
  }
  function openSheet(){injectSheet();requestAnimationFrame(()=>document.querySelector('.android-sheet-backdrop')?.classList.add('open'))}
  function closeSheet(){document.querySelector('.android-sheet-backdrop')?.classList.remove('open')}

  function toast(text,type='ok'){
    const now=Date.now();if(text===lastToast&&now-lastToastAt<1200)return;lastToast=text;lastToastAt=now;
    let stack=document.querySelector('.android-toast-stack');if(!stack){stack=document.createElement('div');stack.className='android-toast-stack android-only';document.body.appendChild(stack)}
    const t=document.createElement('div');t.className='android-toast '+type;t.textContent=text;stack.replaceChildren(t);setTimeout(()=>t.remove(),1500);
  }
  window.androidToast=toast;

  const oldFeedback=window.setControlFeedback;
  if(typeof oldFeedback==='function') window.setControlFeedback=function(text,type='info'){const r=oldFeedback(text,type);if(type==='success')toast(text,'ok');else if(type==='error')toast(text,'err');return r};

  function enhanceUsbCopy(){
    const status=$('usbStatus');if(!status||$('androidUsbHint'))return;
    const hint=document.createElement('div');hint.id='androidUsbHint';hint.className='alert android-only';hint.innerHTML='<b>Android USB:</b> Chrome + USB OTG use करें. Flash के समय Serial Monitor disconnect रखें.';status.parentNode.insertBefore(hint,status);
  }
  function syncDock(){
    const active=document.querySelector('.page.active')?.id?.replace('page-','');if(!active)return;lastPage=active;
    document.querySelectorAll('.android-bottom-nav button[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===active));
  }

  injectDock();injectSheet();injectFanIcon();enhanceUsbCopy();
  const main=document.querySelector('.main');
  if(main){new MutationObserver(()=>{syncDock();injectFanIcon();enhanceUsbCopy()}).observe(main,{subtree:true,attributes:true,attributeFilter:['class'],childList:true})}
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){syncDock();injectFanIcon();enhanceUsbCopy()}});
})();
