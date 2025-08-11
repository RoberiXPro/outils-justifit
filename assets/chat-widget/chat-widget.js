/* Chat Widget - Vanilla JS + Firebase RTDB (v8)
   Edition: ouvert par défaut + zIndex boosté pour éviter tout recouvrement */
(function(){
  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyAN7IrOQfHYJAeO49I1EZxDfupv62Ew9XI",
    authDomain: "madiko-rs.firebaseapp.com",
    databaseURL: "https://madiko-rs-default-rtdb.firebaseio.com",
    projectId: "madiko-rs",
    storageBucket: "madiko-rs.appspot.com",
    messagingSenderId: "746083664475",
    appId: "1:746083664475:web:fe2d5628d20e385d06b57e",
    measurementId: "G-EBWFWCMWFT"
  };

  // Inject Firebase SDK v8 if not present
  function ensureFirebase(cb){
    if (window.firebase && firebase.apps && firebase.apps.length) return cb();
    const scripts = [
      "https://www.gstatic.com/firebasejs/8.6.8/firebase-app.js",
      "https://www.gstatic.com/firebasejs/8.6.8/firebase-database.js"
    ];
    let i=0;
    function next(){
      if (i>=scripts.length) {
        if (!window.firebase) return console.error("Firebase SDK failed to load");
        if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
        cb(); return;
      }
      const s = document.createElement('script');
      s.src = scripts[i++];
      s.onload = next;
      document.head.appendChild(s);
    }
    next();
  }

  const WIDGET_HTML = `
  <!-- OUVERT PAR DÉFAUT (pas de classe 'minimized') -->
  <aside class="chat-panel" id="jf-chat">
    <div class="chat-header">
      <div class="chat-title"><span class="dot"></span> <span>Salon #general</span></div>
      <div class="chat-actions">
        <button class="chat-btn" id="jf-minmax" title="Réduire / Agrandir">↔</button>
      </div>
    </div>
    <div class="chat-body">
      <div class="chat-messages" id="jf-messages"></div>
      <div class="chat-sidebar">
        <div style="font-weight:700; font-size:12px; color:#9ca3af; margin-bottom:6px;">En ligne</div>
        <div id="jf-users"></div>
      </div>
    </div>
    <div class="chat-input-bar">
      <input type="text" id="jf-input" class="chat-input" placeholder="Écrire un message…" autocomplete="off"/>
      <button id="jf-send" class="chat-send-btn">Envoyer</button>
    </div>
    <div class="chat-login" id="jf-login">
      <input type="text" id="jf-username" placeholder="Entre ton pseudo pour rejoindre le chat…" maxlength="30"/>
      <button class="chat-btn" id="jf-join">Rejoindre</button>
    </div>
  </aside>
  <button class="chat-toggle" id="jf-toggle">Chat<span class="chat-unread" id="jf-unread" style="display:none">0</span></button>
  `;

  // Styles
  function injectStyles(){
    if (document.getElementById("jf-chat-style")) return;
    const link = document.createElement("link");
    link.id = "jf-chat-style";
    link.rel = "stylesheet";
    link.href = (window.JF_CHAT_ASSET_BASE || "./assets/chat-widget/") + "chat-widget.css";
    document.head.appendChild(link);
  }

  // DOM helpers
  const $ = sel => document.querySelector(sel);
  function el(html){
    const div = document.createElement("div");
    div.innerHTML = html.trim();
    return div.firstChild;
  }

  // Session
  const ROOM = "general";
  let state = {
    username: localStorage.getItem("jf_chat_username") || "",
    userColor: localStorage.getItem("jf_chat_color") || "",
    unread: 0,
    isFocused: true,
    lastSeenTs: Date.now(),
    initialized: false
  };

  function randColor(){ return ['#F59E0B','#10B981','#3B82F6','#8B5CF6','#EC4899','#F97316'][Math.floor(Math.random()*6)] }
  function initials(name){ return name.split(/\s+/).map(p => p[0]||"").join("").slice(0,2).toUpperCase(); }
  function scrollToBottom(){ const box = $("#jf-messages"); box.scrollTop = box.scrollHeight; }

  function renderMessage(msgId, m){
    const me = state.username;
    const mine = m.sender === me;
    const node = el(`
      <div class="chat-message" data-id="${msgId}">
        <div class="chat-avatar" style="background:${mine? '#1a2a46':'#1e293b'}; color:${state.userColor || '#cbd5e1'}">${initials(m.sender)}</div>
        <div class="chat-bubble">
          <div class="chat-meta">${m.sender} • ${new Date(m.createdAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
          <div class="chat-text"></div>
        </div>
      </div>
    `);
    node.querySelector(".chat-text").textContent = m.text || "";
    $("#jf-messages").appendChild(node);
  }

  function renderUsers(list){
    const box = $("#jf-users");
    box.innerHTML = "";
    list.forEach(u => {
      const online = (Date.now() - u.lastSeen) < 25000; // 25s heartbeat
      const row = el(`
        <div class="user-row">
          <div class="user-avatar" style="color:${u.color || '#cbd5e1'}">${initials(u.name)}</div>
          <div class="user-name">${u.name}</div>
          <div class="user-dot ${online? 'online':''}"></div>
        </div>
      `);
      box.appendChild(row);
    });
  }

  function ensureUsernameUI(){
    const has = !!state.username;
    $("#jf-login").style.display = has ? "none" : "grid";
    $("#jf-input").disabled = !has;
    $("#jf-send").disabled = !has;
  }

  function heartbeat(db){
    if (!state.username) return;
    const ref = db.ref("presence/" + encodeURIComponent(state.username));
    ref.set({
      name: state.username,
      color: state.userColor || "#3B82F6",
      lastSeen: firebase.database.ServerValue.TIMESTAMP
    });
  }

  function subscribePresence(db){
    db.ref("presence").on("value", snap => {
      const val = snap.val() || {};
      const arr = Object.values(val).sort((a,b) => a.name.localeCompare(b.name));
      renderUsers(arr);
    });
    setInterval(() => heartbeat(db), 8000);
    window.addEventListener("focus", () => { state.isFocused=true; state.unread=0; updateUnread(); });
    window.addEventListener("blur", () => state.isFocused=false);
  }

  function updateUnread(){
    const badge = $("#jf-unread");
    if (state.unread>0){ badge.style.display="inline-grid"; badge.textContent = String(state.unread); }
    else { badge.style.display="none"; }
  }

  function initChat(){
    injectStyles();
    document.body.appendChild(el(WIDGET_HTML));

    // 🔒 Forcer l'ouverture et la superposition (au cas où un style global gêne)
    const panel = document.getElementById("jf-chat");
    const toggle = document.getElementById("jf-toggle");
    panel.classList.remove("minimized");             // ouvert par défaut
    panel.style.zIndex = "2147480000";               // très au-dessus
    toggle.style.zIndex = "2147480001";              // bouton au-dessus du panel

    // Min/max & toggle
    $("#jf-minmax").addEventListener("click", () => $("#jf-chat").classList.toggle("minimized"));
    $("#jf-toggle").addEventListener("click", () => {
      const wasMin = $("#jf-chat").classList.contains("minimized");
      $("#jf-chat").classList.remove("minimized");
      if (wasMin){ state.unread = 0; updateUnread(); }
    });

    ensureUsernameUI();
    $("#jf-join").addEventListener("click", () => {
      const val = ($("#jf-username").value || "").trim().slice(0,30);
      if (!val) return;
      state.username = val;
      if (!state.userColor){ state.userColor = randColor(); }
      localStorage.setItem("jf_chat_username", state.username);
      localStorage.setItem("jf_chat_color", state.userColor);
      ensureUsernameUI();
      heartbeat(firebase.database());
    });
    $("#jf-username").addEventListener("keydown", (e)=>{ if (e.key==="Enter") $("#jf-join").click(); });

    const db = firebase.database();
    // Presence
    subscribePresence(db);
    if (state.username) heartbeat(db);

    // Messages
    const listRef = db.ref("rooms/"+ROOM+"/messages").limitToLast(200);
    listRef.on("child_added", s => {
      const m = s.val();
      renderMessage(s.key, m);
      scrollToBottom();
      if (!state.isFocused || $("#jf-chat").classList.contains("minimized")){
        state.unread += 1; updateUnread();
      }
    });

    $("#jf-send").addEventListener("click", send);
    $("#jf-input").addEventListener("keydown", (e)=>{ if (e.key==="Enter") send(); });

    function send(){
      if (!state.username){ $("#jf-username").focus(); return; }
      const text = ($("#jf-input").value || "").trim();
      if (!text) return;
      db.ref("rooms/"+ROOM+"/messages").push({
        text, sender: state.username, color: state.userColor || "#3B82F6",
        createdAt: firebase.database.ServerValue.TIMESTAMP
      }).then(()=>{
        $("#jf-input").value="";
      }).catch(console.error);
    }

    // Best-effort update before closing (on reste "en ligne" quelques secondes via le heartbeat)
    window.addEventListener("beforeunload", () => {
      try { heartbeat(firebase.database()); } catch(e){}
    });

    state.initialized = true;
  }

  ensureFirebase(initChat);
})();
