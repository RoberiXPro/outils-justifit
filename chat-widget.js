(function(){
  const CFG = window.JF_CHAT_CONFIG || {};
  const STORAGE = {
    nameKey: "jf_chat_display_name",
  };

  // ========== Firebase init (compat) ==========
  if (!window.firebase?.apps?.length) {
    firebase.initializeApp(CFG.firebaseConfig);
  }
  const db = firebase.database();

  // ========== Helpers ==========
  const $ = (sel, ctx=document)=>ctx.querySelector(sel);
  const escapeHTML = (s="") => s.replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const fmtTime = (ms)=> new Date(ms||Date.now()).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
  const loadName = ()=> localStorage.getItem(STORAGE.nameKey) || "Agent";
  const saveName = v => localStorage.setItem(STORAGE.nameKey, v);

  // ========== UI ==========
  function mount(){
    const root = document.createElement('div');
    root.className = 'jf-chat jf-chat--min';
    root.innerHTML = `
      <div class="jf-chat__head" id="jfHead">
        <div class="jf-chat__title">💬 POSER DES QUESTION ICI</div>
        <div>
          <button class="jf-chat__btn" id="jfSetNameBtn">PSEUDO ICI</button>
          <button class="jf-chat__btn" id="jfToggleBtn">▲</button>
        </div>
      </div>
      <div class="jf-chat__panel">
        <div class="jf-chat__feed" id="jfFeed"></div>
        <div class="jf-chat__composer">
          <input class="jf-chat__input" id="jfInput" placeholder="Écrire un message… (Entrée pour envoyer)"/>
          <button class="jf-chat__send" id="jfSend">Envoyer</button>
        </div>
        <div class="jf-chat__meta">
          <div>Salle: <strong>${escapeHTML(CFG.room||'default')}</strong> • Nom: <strong id="jfName">${escapeHTML(loadName())}</strong></div>
          <button class="jf-chat__danger" id="jfClearAll" title="Supprimer toutes les conversations">Tout effacer</button>
        </div>
      </div>
    `;
    document.body.appendChild(root);
    wire(root);
    connectRealtime(root);
    touchPresence();
  }

  function wire(root){
    const toggleBtn = $('#jfToggleBtn', root);
    const head = $('#jfHead', root);
    const setNameBtn = $('#jfSetNameBtn', root);
    const nameEl = $('#jfName', root);
    const input = $('#jfInput', root);
    const sendBtn = $('#jfSend', root);
    const clearBtn = $('#jfClearAll', root);

    head.addEventListener('click', (e)=>{
      if(e.target===setNameBtn) return;
      root.classList.toggle('jf-chat--min');
      toggleBtn.textContent = root.classList.contains('jf-chat--min') ? '▲' : '▼';
    });

    setNameBtn.addEventListener('click', ()=>{
      const v = prompt("Ton prénom / pseudo :", loadName());
      if(v){ saveName(v); nameEl.textContent = v; touchPresence(); }
    });

    sendBtn.addEventListener('click', ()=> send());
    input.addEventListener('keydown', (e)=>{
      if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); send(); }
    });

    clearBtn.addEventListener('click', async ()=>{
      if(!confirm("Supprimer toutes les conversations ?")) return;
      try{ await db.ref(`rooms/${CFG.room}/messages`).remove(); }catch(e){}
      $('#jfFeed', root).innerHTML = "";
    });
  }

  // ========== Realtime listeners ==========
  function connectRealtime(root){
    const feed = $('#jfFeed', root);
    const msgsRef = db.ref(`rooms/${CFG.room}/messages`).limitToLast(100);

    // afficher en temps réel
    msgsRef.on('child_added', snap=>{
      const m = snap.val() || {};
      addMsg(feed, { id: snap.key, ...m });
    });
  }

  function addMsg(feedEl, m){
    const el = document.createElement('div');
    el.className = 'jf-msg';
    const avatar = (m.displayName||'?').trim().charAt(0).toUpperCase() || '?';
    el.innerHTML = `
      <div class="jf-msg__avatar" title="${escapeHTML(m.displayName||'')}">${escapeHTML(avatar)}</div>
      <div class="jf-msg__bubble">
        <div><strong>${escapeHTML(m.displayName||'')}</strong></div>
        <div>${escapeHTML(m.text||'')}</div>
        <div class="jf-msg__meta">${fmtTime(m.at)}</div>
      </div>
    `;
    feedEl.appendChild(el);
    feedEl.scrollTop = feedEl.scrollHeight;
  }

  // ========== Send & presence ==========
  async function send(){
    const input = document.getElementById('jfInput');
    const text = (input.value||"").trim();
    if(!text) return;
    input.value = "";

    const msg = {
      displayName: loadName(),
      text,
      at: Date.now() // côté client; ok pour MVP
    };
    try{
      await firebase.database().ref(`rooms/${CFG.room}/messages`).push(msg);
      touchPresence();
    }catch(e){
      console.warn("send failed", e);
    }
  }

  // présence simple : met à jour lastSeen + nom affiché
  function touchPresence(){
    const name = loadName();
    const uid = 'anon-' + (name||'agent').toLowerCase();
    firebase.database().ref(`roomUsers/${CFG.room}/${uid}`).set({
      displayName: name, lastSeen: Date.now()
    }).catch(()=>{});
  }

  // ========== Mount ==========
  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded", mount);
  }else{
    mount();
  }
})();
