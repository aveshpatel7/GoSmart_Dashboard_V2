/* Go Smart Android Compact UX v2. Android only; no MQTT/backend/control overrides. */
(function(){
  if(!/Android/i.test(navigator.userAgent||'')) return;
  const $=id=>document.getElementById(id);
  document.body.classList.add('is-android','reduce-motion');
  let lastPage='overview', lastToast='', lastToastAt=0;

  function openPage(name){
    if(typeof window.showPage==='function') window.showPage(name);
    lastPage=name;
    document.querySelectorAll('.android-bottom-nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===name));
    $('sidebar')?.classList.remove('open');
    window.scrollTo(0,0);
  }
  function injectDock(){
    if(document.querySelector('.android-bottom-nav')) return;
    const nav=document.createElement('nav'); nav.className='android-bottom-nav android-only'; nav.setAttribute('aria-label','Quick navigation');
    const items=[['overview','⌂','Home'],['devices','▦','Devices'],['control','◉','Control'],['ota','⇧','OTA'],['alerts','!','Alerts']];
    nav.innerHTML=items.map(([p,i,l])=>`<button type="button" data-page="${p}"><b>${i}</b><span>${l}</span></button>`).join('');
    nav.addEventListener('click',e=>{const b=e.target.closest('button[data-page]');if(b)openPage(b.dataset.page)});
    document.body.appendChild(nav); openPage(document.querySelector('.page.active')?.id?.replace('page-','')||lastPage);
  }
  function toast(text,type='ok'){
    const now=Date.now(); if(text===lastToast&&now-lastToastAt<1200)return; lastToast=text;lastToastAt=now;
    let stack=document.querySelector('.android-toast-stack'); if(!stack){stack=document.createElement('div');stack.className='android-toast-stack android-only';document.body.appendChild(stack)}
    const t=document.createElement('div');t.className='android-toast '+type;t.textContent=text;stack.replaceChildren(t);setTimeout(()=>{t.style.opacity='0';t.style.transform='translateY(5px)';setTimeout(()=>t.remove(),160)},1500);
  }
  window.androidToast=toast;

  /* Keep feedback useful without adding another expensive animation layer. */
  const oldFeedback=window.setControlFeedback;
  if(typeof oldFeedback==='function') window.setControlFeedback=function(text,type='info'){const r=oldFeedback(text,type);if(type==='success')toast(text,'ok');else if(type==='error')toast(text,'err');return r};

  function enhanceUsbCopy(){
    const status=$('usbStatus');if(!status||$('androidUsbHint'))return;
    const hint=document.createElement('div');hint.id='androidUsbHint';hint.className='alert android-only';hint.innerHTML='<b>Android USB:</b> Chrome + USB OTG use करें. Flash के समय Serial Monitor disconnect रखें.';status.parentNode.insertBefore(hint,status);
  }
  function syncDock(){const active=document.querySelector('.page.active')?.id?.replace('page-','');if(!active)return;lastPage=active;document.querySelectorAll('.android-bottom-nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===active))}

  /* MutationObserver replaces the old 1.2-second polling loop. */
  injectDock();enhanceUsbCopy();
  const observer=new MutationObserver(()=>{syncDock();enhanceUsbCopy()});
  document.querySelector('.main')&&observer.observe(document.querySelector('.main'),{subtree:true,attributes:true,attributeFilter:['class'],childList:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){syncDock();enhanceUsbCopy()}});
})();
