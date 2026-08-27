/* Go Smart Theme Settings v1 — theme control lives only inside Settings. */
(function(){
  const $=id=>document.getElementById(id);
  const THEMES={
    ocean:{label:'Ocean Teal',sub:'Deep ocean teal with cyan and green accents',cls:'gs-theme-ocean'},
    neon:{label:'Neon Nite',sub:'Dark futuristic purple / blue command-center look',cls:'gs-theme-neon'},
    light:{label:'Light Modern',sub:'Clean bright interface with blue accents',cls:'gs-theme-light'}
  };

  function current(){return localStorage.getItem('gosmart_visual_theme')||'ocean'}
  function applyTheme(name,announce=true){
    if(!THEMES[name])name='ocean';
    Object.values(THEMES).forEach(t=>document.body.classList.remove(t.cls));
    /* retire older theme classes so only one system is authoritative */
    ['theme-neon','theme-midnight','theme-titanium','theme-apple','theme-industrial'].forEach(c=>document.body.classList.remove(c));
    document.body.classList.add(THEMES[name].cls);
    localStorage.setItem('gosmart_visual_theme',name);
    localStorage.setItem('gosmart_theme',name==='ocean'?'neon':name==='neon'?'midnight':'light');
    document.querySelectorAll('.gs-theme-card').forEach(c=>c.classList.toggle('selected',c.dataset.theme===name));
    const text=$('gsCurrentTheme');if(text)text.textContent=THEMES[name].label;
    if(announce&&window.gsToast)window.gsToast(`${THEMES[name].label} theme applied`);
  }

  function createSettingsPage(){
    if($('page-appearance'))return;
    const main=document.querySelector('main.main');if(!main)return;
    const sec=document.createElement('section');sec.className='page';sec.id='page-appearance';
    sec.innerHTML=`
      <div class="gs-settings-head">
        <div><span class="eyebrow">APPEARANCE</span><h1>Dashboard Theme</h1><p>Choose how Go Smart looks on this browser. Your choice is saved automatically.</p></div>
        <div class="gs-current-pill">Current: <b id="gsCurrentTheme">Ocean Teal</b></div>
      </div>
      <div class="gs-theme-grid">
        <button type="button" class="gs-theme-card" data-theme="ocean">
          <div class="gs-theme-preview ocean"><span></span><i></i><i></i><i></i></div>
          <div class="gs-theme-copy"><b>Ocean Teal</b><span>Deep teal · Cyan · Green</span><small>Recommended · Smart-home / IoT identity</small></div><strong>✓</strong>
        </button>
        <button type="button" class="gs-theme-card" data-theme="neon">
          <div class="gs-theme-preview neon"><span></span><i></i><i></i><i></i></div>
          <div class="gs-theme-copy"><b>Neon Nite</b><span>Black · Purple · Electric blue</span><small>Futuristic command-center style</small></div><strong>✓</strong>
        </button>
        <button type="button" class="gs-theme-card" data-theme="light">
          <div class="gs-theme-preview light"><span></span><i></i><i></i><i></i></div>
          <div class="gs-theme-copy"><b>Light Modern</b><span>White · Soft gray · Blue</span><small>Clean daytime / office view</small></div><strong>✓</strong>
        </button>
      </div>
      <article class="card gs-theme-note"><h3>Theme behavior</h3><p class="muted">Only appearance changes. MQTT, Relay/Fan control, OTA, USB Flash, Serial Monitor and backend logic stay exactly the same.</p></article>`;
    main.appendChild(sec);
    sec.addEventListener('click',e=>{const c=e.target.closest('.gs-theme-card[data-theme]');if(c)applyTheme(c.dataset.theme)});
  }

  function openSettings(){
    createSettingsPage();
    document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
    $('page-appearance')?.classList.add('active');
    document.querySelectorAll('.nav').forEach(n=>n.classList.remove('active'));
    document.querySelector('.nav[data-page="appearance"]')?.classList.add('active');
    if($('pageTitle'))$('pageTitle').textContent='Settings';
    if($('pageSub'))$('pageSub').textContent='Appearance and dashboard preferences';
    applyTheme(current(),false);window.scrollTo(0,0);
  }

  function navButton(){
    let b=document.querySelector('.nav[data-page="appearance"]');if(b)return b;
    b=document.createElement('button');b.type='button';b.className='nav';b.dataset.page='appearance';b.innerHTML='⚙ <span>Settings</span>';
    b.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();openSettings()},{capture:true});
    return b;
  }

  function insertNav(){
    const nav=document.querySelector('.sidebar nav');if(!nav)return;
    const b=navButton();
    if(b.isConnected)return;
    const admin=nav.querySelector('.nav-section[data-group="admin"] .nav-section-body');
    if(admin){admin.appendChild(b);return}
    nav.appendChild(b);
  }

  function hideExternalThemeControls(){
    $('#proTheme')?.remove();$('#premiumThemeMenu')?.remove();const t=$('themeBtn');if(t)t.style.display='none';
  }

  function boot(){createSettingsPage();insertNav();hideExternalThemeControls();applyTheme(current(),false)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
  [100,400,1000,2200].forEach(ms=>setTimeout(()=>{insertNav();hideExternalThemeControls();applyTheme(current(),false)},ms));
  window.goSmartOpenSettings=openSettings;window.goSmartApplyTheme=applyTheme;
})();