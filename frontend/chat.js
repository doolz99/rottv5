// --- Mobile block overlay logic ---
// --- Available users visual indicator logic ---
const userIndicatorCanvas = document.getElementById('userIndicatorCanvas');
let availableUsers = [];
let userIndicatorPositions = [];
function drawUserIndicators() {
  if (!userIndicatorCanvas) return;
  const ctx = userIndicatorCanvas.getContext('2d');
  ctx.clearRect(0, 0, userIndicatorCanvas.width, userIndicatorCanvas.height);
  userIndicatorPositions = [];
  if (!availableUsers.length) return;
  const w = userIndicatorCanvas.width, h = userIndicatorCanvas.height;
  const cx = w/2, cy = h/2, r = Math.min(w,h)/3;
  const N = availableUsers.length;
  function userColor(id) {
    // Simple hash to HSL color
    let hash = 0;
    for (let i = 0; i < id.length; ++i) {
      hash = ((hash << 5) - hash) + id.charCodeAt(i);
      hash |= 0;
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 65%, 55%)`;
  }
  for (let i = 0; i < N; ++i) {
    const angle = (2 * Math.PI * i) / N;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    userIndicatorPositions.push({x, y, id: availableUsers[i].id});
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, 40, 0, 2 * Math.PI);
    ctx.fillStyle = userColor(availableUsers[i].id);
    ctx.globalAlpha = 0.7;
    ctx.fill();
    ctx.globalAlpha = 1.0;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.font = 'bold 22px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('user', x, y);
    ctx.restore();
  }
}
function showUserIndicators(users) {
  // Remove own user from the list
  const myId = typeof userId !== 'undefined' ? userId : null;
  availableUsers = myId ? users.filter(u => u.id !== myId) : users;
  // Hide circles if currently paired
  const isPaired = !!chatId;
  if (userIndicatorCanvas) {
    if (isPaired || users.length === 0) {
      userIndicatorCanvas.style.display = 'none';
      userIndicatorCanvas.style.pointerEvents = 'none';
      userIndicatorCanvas.style.zIndex = '0';
    } else {
      userIndicatorCanvas.style.display = '';
      drawUserIndicators();
      userIndicatorCanvas.style.pointerEvents = 'auto';
      userIndicatorCanvas.style.zIndex = '10';
    }
  }
}
if (userIndicatorCanvas) {
  userIndicatorCanvas.width = window.innerWidth;
  userIndicatorCanvas.height = window.innerHeight;
  window.addEventListener('resize', () => {
    userIndicatorCanvas.width = window.innerWidth;
    userIndicatorCanvas.height = window.innerHeight;
    drawUserIndicators();
  });
  userIndicatorCanvas.addEventListener('click', function(e) {
    const rect = userIndicatorCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    for (const pos of userIndicatorPositions) {
      const dx = x - pos.x, dy = y - pos.y;
      if (dx*dx + dy*dy < 40*40) {
        // Clicked this user
        requestUserChat(pos.id);
        break;
      }
    }
  });
}
function requestUserChat(userId) {
  // Send a request to the server to connect to this user
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify({type: 'request_user_chat', userId}));
    setStatus('connecting...');
    showUserIndicators([]); // Hide overlay
  }
}
// Listen for available user list from backend
// (You must add backend support for this event)
// Example usage: showUserIndicators([{id: 'user1'}, {id: 'user2'}]);
function isMobileDevice() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}


function showMobileBlockOverlay() {
  var overlay = document.getElementById('mobileBlockOverlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
  overlay.innerHTML = 'PHONE POSTERS FUCK OFF';
  // TTS
  if ('speechSynthesis' in window) {
    try {
      var utter = new window.SpeechSynthesisUtterance('PHONE POSTERS FUCK OFF');
      utter.rate = 1.0;
      utter.pitch = 1.0;
      utter.volume = 1.0;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utter);
    } catch(e) {}
  }
  // Repeating beep alarm
  function playBeep() {
    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      var o = ctx.createOscillator();
      var g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = 880;
      g.gain.value = 0.25;
      o.connect(g).connect(ctx.destination);
      o.start();
      setTimeout(function(){ o.stop(); ctx.close(); }, 180);
    } catch(e) {}
  }
  var beepInterval = setInterval(playBeep, 400);
  // Stop beeping if overlay is hidden (defensive)
  overlay.addEventListener('transitionend', function() {
    if (overlay.style.display === 'none') clearInterval(beepInterval);
  });
}

if (isMobileDevice()) {
  showMobileBlockOverlay();
  // Optionally, stop further JS execution for chat
  throw new Error('Blocked on mobile');
}
const wsUrl = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
let ws;
let userId=null; let chatId=null;
let mode = sessionStorage.getItem('mode')||'random';
let tags = [];
try{ if(mode==='tags'){ tags = JSON.parse(sessionStorage.getItem('tags')||'[]'); } }catch(e){}

const messagesEl = document.getElementById('messages');
const typingGhostEl = document.getElementById('typingGhost');
const selfDraftEl = document.getElementById('selfDraft');
const draftTextSpan = document.getElementById('draftText');
const inlineCaret = document.getElementById('inlineCaret');
const clickArea = document.getElementById('clickArea');
const overlayInput = document.getElementById('overlayInput'); // hidden focus sink
const caret = document.getElementById('caret');
const mobileInputForm = document.getElementById('mobileInputForm');
const mobileInput = document.getElementById('mobileInput');
const mobileSendBtn = document.getElementById('mobileSendBtn');
const statusBar = document.getElementById('statusBar');
let skipBtn = document.getElementById('skipBtn');
let searchBtnGlobal = null; // reference after binding
let disconnectBtn = null;
let leaveBtn = null; // removed
const remoteToggle = document.getElementById('remoteToggle');
const remotePanel = document.getElementById('remotePanel');
const populationCounter = document.getElementById('populationCounter');
let lastPopulation = null;
let guideEnabled = true; // guide always enabled now (speech always on)
let guideTimer = null;
let speakingUtter = null;
const guideEl = document.getElementById('guideCharacter');
const gcTextEl = document.getElementById('gcText');
const gcCloseBtn = document.getElementById('gcClose');

function showGuide(){ if(!guideEl) return; guideEl.classList.add('open'); }
function hideGuide(){ if(!guideEl) return; guideEl.classList.remove('open'); }
if(gcCloseBtn){ gcCloseBtn.onclick = ()=>{ hideGuide(); }; }

function clearGuideTimer(){ if(guideTimer){ clearTimeout(guideTimer); guideTimer=null; } }
function setGuideAutoHide(){ clearGuideTimer(); guideTimer = setTimeout(()=>{ hideGuide(); }, 9000); }

function speakGuide(text, {tts=true, keepOpen=false, indicateTalking=true}={}){
  if(!guideEnabled) return;
  if(!guideEl || !gcTextEl) return;
  gcTextEl.textContent = text;
  if(!text.trim()) gcTextEl.parentNode && gcTextEl.parentNode.classList.add('empty'); else gcTextEl.parentNode && gcTextEl.parentNode.classList.remove('empty');
  showGuide();
  if(indicateTalking) gcTextEl.parentNode.classList.add('talking'); else gcTextEl.parentNode.classList.remove('talking');
  if(tts && 'speechSynthesis' in window){
    try{
      if(speakingUtter){ window.speechSynthesis.cancel(); }
      const utter = new SpeechSynthesisUtterance(text);
      speakingUtter = utter;
      utter.rate = 1.0;
      utter.pitch = 1.05;
      utter.volume = 0.9;
      utter.onend = ()=>{ speakingUtter=null; gcTextEl.parentNode.classList.remove('talking'); if(!keepOpen) setGuideAutoHide(); };
      utter.onerror = ()=>{ speakingUtter=null; gcTextEl.parentNode.classList.remove('talking'); if(!keepOpen) setGuideAutoHide(); };
      window.speechSynthesis.speak(utter);
    }catch(e){ if(!keepOpen) setGuideAutoHide(); }
  } else {
    if(!keepOpen) setGuideAutoHide();
  }
}

// --- Audio Helpers ---
let audioCtx = null;
function ensureAudio(){
  if(!audioCtx){
    try{ audioCtx = new (window.AudioContext||window.webkitAudioContext)(); }catch(e){}
  }
}
function playTone({freq=440, dur=0.25, type='sine', vol=0.3, attack=0.01, release=0.08, detune=0, pan=0}){
  ensureAudio();
  if(!audioCtx) return;
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  let panner;
  try{ panner = audioCtx.createStereoPanner(); }catch(e){}
  osc.type = type; osc.frequency.setValueAtTime(freq, now); if(detune) osc.detune.setValueAtTime(detune, now);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(vol, now+attack);
  gain.gain.setTargetAtTime(0, now+attack+Math.max(0,dur-attack-release), release);
  const end = now + dur + release*2;
  if(panner){ panner.pan.setValueAtTime(pan, now); osc.connect(gain).connect(panner).connect(audioCtx.destination);} else { osc.connect(gain).connect(audioCtx.destination); }
  osc.start(now); osc.stop(end);
}
function chord(specs){ specs.forEach(s=>playTone(s)); }
const SOUND = {
  searching(){ playTone({freq:340,dur:0.22,type:'triangle',vol:0.22}); },
  searchingTags(){ chord([
    {freq:420,dur:0.28,vol:0.18,type:'sine'},
    {freq:640,dur:0.34,vol:0.12,type:'sine'}
  ]); },
  paired(){ chord([
    {freq:520,dur:0.18,vol:0.23,type:'triangle'},
    {freq:780,dur:0.26,vol:0.18,type:'sine'},
    {freq:1040,dur:0.32,vol:0.12,type:'sine'}
  ]); },
  matchedTags(){ chord([
    {freq:560,dur:0.22,vol:0.22,type:'triangle'},
    {freq:840,dur:0.30,vol:0.16,type:'sine'},
    {freq:1120,dur:0.36,vol:0.10,type:'sine'}
  ]); },
  partnerLeft(){ playTone({freq:170,dur:0.4,vol:0.25,type:'sawtooth'}); },
  messageSelf(){ playTone({freq:300,dur:0.07,vol:0.15,type:'square'}); },
  messagePartner(){ playTone({freq:440,dur:0.07,vol:0.18,type:'square'}); },
  skip(){ playTone({freq:260,dur:0.12,vol:0.2,type:'triangle'}); playTone({freq:190,dur:0.18,vol:0.14,type:'sine', attack:0.005}); },
  population(){ playTone({freq:880,dur:0.06,vol:0.12,type:'sine'}); }
};

function spawnPopulationSparks(newCount){
  if(!populationCounter) return;
  const rect = populationCounter.getBoundingClientRect();
  const cx = rect.left + rect.width/2;
  const cy = rect.top + rect.height/2;
  const sparks = Math.min(12, Math.max(4, (lastPopulation===null?4: Math.abs(newCount - lastPopulation)*2)));
  for(let i=0;i<sparks;i++){
    const div = document.createElement('div');
    div.className = 'pop-spark'+(Math.random()<0.4?' alt':'');
    const angle = Math.random()*Math.PI*2;
    const dist = 40 + Math.random()*120;
    const ex = cx + Math.cos(angle)*dist;
    const ey = cy + Math.sin(angle)*(dist*0.6 + Math.random()*40);
    div.style.setProperty('--sx', cx+'px');
    div.style.setProperty('--sy', cy+'px');
    div.style.setProperty('--ex', ex+'px');
    div.style.setProperty('--ey', ey+'px');
    document.body.appendChild(div);
    setTimeout(()=>{ if(div.parentNode) div.parentNode.removeChild(div); }, 850);
  }
}
// Home feature elements inside remote
let remoteTagInput = document.getElementById('remoteTagInput');
let remoteTagsDisplay = document.getElementById('remoteTagsDisplay');
let remoteRandomBtn = document.getElementById('remoteRandomBtn');
let remoteTagsBtn = document.getElementById('remoteTagsBtn');
let remoteCurrentMode = null;

let lastTypingSent = 0;
let focusActive = false;
let draftBuffer = '';

// --- Mobile input helpers ---
function isMobileDevice() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

function showMobileInput() {
  if (mobileInputForm) mobileInputForm.style.display = '';
  if (mobileInput) mobileInput.focus();
}
function hideMobileInput() {
  if (mobileInputForm) mobileInputForm.style.display = 'none';
}

if (isMobileDevice()) {
  showMobileInput();
  // Hide overlayInput and clickArea for mobile
  if (overlayInput) overlayInput.style.display = 'none';
  if (clickArea) clickArea.style.display = 'none';
}
let tagCounts = {}; // updated from server
// Scroll feature removed; maintaining original centered behavior.

function connect(){
  if(ws && (ws.readyState===0 || ws.readyState===1)) return; // already connecting/connected
  ws = new WebSocket(wsUrl);
  ws.onopen = ()=>{
    setStatus('idle');
  };
  ws.onmessage = (ev)=>{
    const data = JSON.parse(ev.data);
    if (data.type === 'available_users') {
      showUserIndicators(data.users || []);
      return;
    }
    switch(data.type){
      case 'welcome': userId=data.userId; break;
      case 'queue_status': {
        const st = data.status;
        if(st === 'waiting'){
          setStatus('waiting');
          if(searchBtnGlobal && !chatId){ searchBtnGlobal.disabled = false; }
          if(disconnectBtn){ disconnectBtn.disabled = false; }
        } else if(st === 'in_chat') {
          // Do not set paired until actual paired event sets chatId
          setStatus(chatId? 'paired':'connecting...');
        }
        console.debug('[queue_status]', st, 'chatId:', chatId);
        break; }
  case 'paired':
      chatId=data.chatId;
      setStatus('paired');
      console.debug('[paired event]', data.chatId, data.matchedTags);
      if(searchBtnGlobal){ searchBtnGlobal.disabled = true; }
      if(disconnectBtn){ disconnectBtn.disabled = false; }
      if(data.matchedTags && data.matchedTags.length){ SOUND.matchedTags(); } else { SOUND.paired(); }
      typingGhostEl.textContent='';
      typingGhostEl.classList.remove('partner');
      // matched tags bar removed (no tag pill render)
      if(data.matchedTags && data.matchedTags.length){
        speakGuide('matched on ' + data.matchedTags.join(', '), {tts:true});
      } else {
        speakGuide('connected to a partner', {tts:true});
      }
      break;
  case 'message': addMessage(data.text, true); SOUND.messagePartner(); break;
  case 'typing': typingGhostEl.textContent = data.preview; typingGhostEl.classList.add('partner'); applyFontSize(typingGhostEl, data.preview.length || 1); layoutOverlays(); adjustCentering(); break;
    case 'tag_counts': tagCounts = data.counts || {}; updateRemoteTagTooltips(); break;
      case 'partner_disconnected':
        SOUND.partnerLeft();
        chatId=null;
        setStatus('disconnected');
        if(searchBtnGlobal){ searchBtnGlobal.disabled = false; }
        if(disconnectBtn){ disconnectBtn.disabled = false; }
  // matched tags bar removed
  speakGuide('partner disconnected', {tts:true});
        break;
      case 'population':
        if(populationCounter){
          populationCounter.textContent = String(data.count);
          // simple highlight pulse when changes
          populationCounter.classList.add('hot');
          setTimeout(()=>populationCounter.classList.remove('hot'), 800);
          // flash animation retrigger
          populationCounter.classList.remove('flash');
          void populationCounter.offsetWidth; // force reflow to restart animation
            populationCounter.classList.add('flash');
          spawnPopulationSparks(data.count);
          lastPopulation = data.count;
          SOUND.population();
        }
        break;
      default:
        // Pass to tag canvas handler (if it's one of those types)
        handleTagCanvasMessages && handleTagCanvasMessages(data);
        break;
    }
  };
  ws.onclose = ()=>{ setStatus('connection closed'); disableSkip(); };
}

function setStatus(s){ statusBar.textContent=s; }

function addMessage(text, partner=false){
  const div = document.createElement('div');
  div.className='message';
  if(partner) div.classList.add('partner');
  div.textContent=text;
  applyFontSize(div, text.length);
  messagesEl.appendChild(div);
  scheduleEveryThirdFade();
  adjustCentering();
  // On mobile, scroll to bottom so new message is visible above keyboard
  if (window.innerWidth <= 600) {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
}
function addSystemMessage(text, options = {}){
  const div = document.createElement('div');
  div.className='message system';
  div.style.opacity='0.6';
  div.textContent=text;
  applyFontSize(div, text.length);
  messagesEl.appendChild(div);
  adjustCentering();
  if(options.autoHide){
    // Move to bottom overlay presentation
    div.classList.add('bottom-float');
    // Detach from normal flow so it doesn't affect centering
    // (messagesEl append keeps copy, but we can optionally not append. We'll keep for log; clone for bottom.)
    setTimeout(()=>{
      div.style.transition='opacity 0.6s ease';
      div.style.opacity='0';
      setTimeout(()=>{ if(div.parentNode) { div.parentNode.removeChild(div); adjustCentering(); } }, 650);
    }, options.delay || 2500);
  }
}

function applyFontSize(el, len){
  // linear scale: len <=4 => 48px; len>=160 =>14px
  const max=48, min=14, range=160;
  let size;
  if(len<=4) size=max; else if(len>=range) size=min; else size = max - ( (len-4)/(range-4) )*(max-min);
  // viewport tweak
  const vw = Math.max(window.innerWidth, 300);
  const factor = Math.min(1, vw/1200);
  size = size * factor;
  el.style.fontSize = size.toFixed(2)+'px';
}

function adjustCentering(){
  const vh = window.innerHeight;
  const margin = 20; // top/bottom safe margin
  const maxCenteredHeight = vh * 0.6; // clamp height before pin-to-top behavior
  const draftRect = selfDraftEl.textContent ? selfDraftEl.getBoundingClientRect() : null;
  const ghostRect = typingGhostEl.textContent ? typingGhostEl.getBoundingClientRect() : null;

  // Start from perfectly centered
  messagesEl.style.top='50%';
  messagesEl.style.bottom='';
  messagesEl.style.transform='translate(-50%,-50%)';
  const natural = messagesEl.getBoundingClientRect();

  let targetTopPx;
  // Determine highest overlay (draft or ghost) to avoid overlap
  const overlayTop = Math.min(
    draftRect ? draftRect.top : Infinity,
    ghostRect ? ghostRect.top : Infinity
  );

  if(natural.height > maxCenteredHeight){
    // Too tall to comfortably center: anchor towards top within margin
    targetTopPx = margin;
  } else if(overlayTop !== Infinity){
    // Fit messages so their bottom sits 'margin' above the top overlay
    const desiredBottom = overlayTop - margin;
    const proposedTop = desiredBottom - natural.height;
    const centeredTopPx = (vh / 2) - (natural.height / 2);
    targetTopPx = Math.min(centeredTopPx, Math.max(margin, proposedTop));
  } else {
    // Regular centering
    targetTopPx = (vh / 2) - (natural.height / 2);
  }

  // Clamp within viewport margins
  if(targetTopPx < margin) targetTopPx = margin;
  if(targetTopPx + natural.height > vh - margin){
    targetTopPx = Math.max(margin, vh - margin - natural.height);
  }

  const centeredTopPx = (vh / 2) - (natural.height / 2);
  if(Math.abs(targetTopPx - centeredTopPx) < 2){
    // Stay perfectly centered
    messagesEl.style.top='50%';
    messagesEl.style.transform='translate(-50%,-50%)';
  } else {
    const pct = (targetTopPx / vh) * 100;
    messagesEl.style.top = pct + '%';
    messagesEl.style.transform='translate(-50%,0)';
  }
}

// Offscreen pruning removed to restore original stable behavior.

// Track and fade every third non-system message to free space.
// Archived messages for memory echoes
const archivedMessages = []; // { text, partner, ts }
function scheduleEveryThirdFade(){
  // Keep last two; animate older ones floating away.
  const normalMessages = Array.from(messagesEl.querySelectorAll('.message'))
    .filter(m=>!m.classList.contains('system') && !m.classList.contains('floating-away'));
  if(normalMessages.length <= 2) return;
  const toFloat = normalMessages.slice(0, -2);
  toFloat.forEach(m=>{
    if(m.dataset.fading) return; // already processed
    m.dataset.fading='1';
    // Capture current screen position BEFORE detaching from flow
    const rect = m.getBoundingClientRect();
    // Archive content before altering
    archivedMessages.push({ text: m.textContent, partner: m.classList.contains('partner'), ts: Date.now() });
    // random drift endpoints
    const driftX = (Math.random()*2 - 1) * 200; // -200..200 px
    const driftY = - (100 + Math.random()*180); // upward drift
    // Set CSS vars for keyframes
    m.style.setProperty('--fx-start-x', `${rect.left}px`);
    m.style.setProperty('--fx-start-y', `${rect.top}px`);
    m.style.setProperty('--fx-end-x', `${rect.left + driftX}px`);
    m.style.setProperty('--fx-end-y', `${rect.top + driftY}px`);
    // Fix its dimensions to avoid reflow flash
    m.style.width = rect.width + 'px';
    m.style.height = rect.height + 'px';
    // Apply initial translate via inline style so animation uses absolute values
    m.classList.add('floating-away');
    // Remove from logical flow after a frame so layout recalculates for remaining messages
    requestAnimationFrame(()=>{
      // Remove from messages container if still present (logical removal) but keep on body for animation layering
      if(m.parentNode === messagesEl){
        document.body.appendChild(m); // move to body for free float
        adjustCentering();
      }
      // After animation ends (6s), remove node entirely
      setTimeout(()=>{ if(m.parentNode){ m.parentNode.removeChild(m); } }, 6000);
    });
  });
}

// Periodically spawn a drifting memory echo from archived messages
let memoryTimer = null;
function startMemoryEchoes(){
  if(memoryTimer) return;
  const spawn = () => {
    if(archivedMessages.length === 0){ scheduleNext(); return; }
    // Pick a random archived message; bias toward newer ones slightly
    const idx = Math.floor(Math.pow(Math.random(), 0.6) * archivedMessages.length);
    const item = archivedMessages[idx];
    createMemoryEcho(item);
    scheduleNext();
  };
  const scheduleNext = () => {
    // Random interval 5s - 14s
    const delay = 5000 + Math.random()*9000;
    memoryTimer = setTimeout(spawn, delay);
  };
  scheduleNext();
}

function createMemoryEcho(item){
  const div = document.createElement('div');
  div.className='memory-echo';
  div.textContent = item.text;
  // font size similar scaling but smaller & subtle
  applyFontSize(div, item.text.length || 1);
  // shrink a bit
  const fs = parseFloat(div.style.fontSize)||16;
  div.style.fontSize = (fs * 0.75).toFixed(2)+'px';
  if(item.partner){
    // give partner echoes faint reddish tint
    div.style.color='rgba(255,102,102,0.35)';
  }
  // Random start somewhere around edges / mid
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const edge = Math.random();
  let startX, startY, endX, endY;
  if(edge < 0.25){ // left to right drift
    startX = -100; startY = vh * Math.random()*0.8 + 40;
    endX = vw + 120; endY = startY - (60 + Math.random()*120);
  } else if(edge < 0.5){ // right to left
    startX = vw + 100; startY = vh * Math.random()*0.8 + 40;
    endX = -140; endY = startY - (40 + Math.random()*140);
  } else if(edge < 0.75){ // bottom rising
    startX = vw * 0.2 + Math.random()*vw*0.6; startY = vh + 80;
    endX = startX + (Math.random()*2-1)*200; endY = -120;
  } else { // top descending slight (rare)
    startX = vw * Math.random(); startY = -120;
    endX = startX + (Math.random()*2-1)*250; endY = vh + 60;
  }
  div.style.setProperty('--mem-start-x', startX+'px');
  div.style.setProperty('--mem-start-y', startY+'px');
  div.style.setProperty('--mem-end-x', endX+'px');
  div.style.setProperty('--mem-end-y', endY+'px');
  const dur = 7000 + Math.random()*6000; // 7s - 13s
  div.style.setProperty('--mem-dur', dur+'ms');
  document.body.appendChild(div);
  setTimeout(()=>{ if(div.parentNode){ div.parentNode.removeChild(div); } }, dur);
}

// Start memory echoes shortly after load
setTimeout(()=>{ startMemoryEchoes(); }, 4000);

window.addEventListener('resize', ()=>{
  // Recompute sizes
  Array.from(document.querySelectorAll('.message')).forEach(m=>{
    applyFontSize(m, m.textContent.length);
  });
  adjustCentering();
});


if (!isMobileDevice()) {
  clickArea.addEventListener('click', focusInput);
  overlayInput.addEventListener('focus', ()=>{ inlineCaret.classList.remove('hidden'); focusActive=true; });
  overlayInput.addEventListener('blur', ()=>{ inlineCaret.classList.add('hidden'); focusActive=false; });
  function focusInput(){ overlayInput.focus(); focusActive=true; inlineCaret.classList.remove('hidden'); }
}

function positionCaret(){
  // simple bottom-left caret; could extend to follow text length if we wanted pre-submit editing visible
}


if (!isMobileDevice()) {
  document.addEventListener('keydown', (e)=>{
    if(!focusActive) return;
    if(e.key==='Escape'){
      e.preventDefault();
      // Use skip behavior instead of leave
      if(ws && ws.readyState===1){ ws.send(JSON.stringify({type:'skip'})); setStatus('skipping...'); typingGhostEl.textContent=''; }
      return;
    }
    if(e.key==='Enter' && !e.shiftKey){
      e.preventDefault();
      sendMessage();
      return;
    }
    if(e.key==='Backspace'){
      draftBuffer = draftBuffer.slice(0,-1);
    } else if(e.key==='Tab'){
      e.preventDefault();
    } else if(e.key.length === 1){
      draftBuffer += e.key;
    }
    updateDraft();
  });

  document.addEventListener('paste', (e)=>{
    if(!focusActive) return;
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text');
    draftBuffer += text;
    updateDraft();
  });
}

// --- Mobile send button and textarea ---
if (isMobileDevice() && mobileInputForm && mobileInput) {
  mobileInputForm.addEventListener('submit', function(e) {
    e.preventDefault();
    const text = mobileInput.value.trim();
    if (!text) return;
    ws && ws.readyState===1 && chatId && ws.send(JSON.stringify({type:'message', text}));
    addMessage(text, false);
    SOUND.messageSelf();
    mobileInput.value = '';
    typingGhostEl.textContent='';
    typingGhostEl.classList.remove('partner');
    updateDraft();
  });
  mobileInput.addEventListener('input', function() {
  ws && ws.readyState===1 && chatId && ws.send(JSON.stringify({type:'typing', preview: mobileInput.value}));
    updateDraft();
  });
}

function updateDraft(){
  // Use a zero-width space when empty so element has measurable height for centering
  draftTextSpan.textContent = draftBuffer || '\u200b';
  applyFontSize(selfDraftEl, draftBuffer.length || 1);
  // match caret size
  inlineCaret.style.fontSize = selfDraftEl.style.fontSize;
  layoutOverlays();
  adjustCentering();
  const now = performance.now();
  if(now - lastTypingSent > 40){
    lastTypingSent = now;
    ws && ws.readyState===1 && chatId && ws.send(JSON.stringify({type:'typing', preview: draftBuffer}));
  }
}

function sendMessage(){
  const text = draftBuffer.trimEnd();
  if(!text) return;
  ws && ws.readyState===1 && chatId && ws.send(JSON.stringify({type:'message', text}));
  addMessage(text, false);
  SOUND.messageSelf();
  draftBuffer='';
  draftTextSpan.textContent='';
  typingGhostEl.textContent='';
  typingGhostEl.classList.remove('partner');
  updateDraft();
}

function layoutOverlays(){
  const vh = window.innerHeight;
  const spacing = 18;
  const hasDraft = !!selfDraftEl.textContent;
  const hasGhost = !!typingGhostEl.textContent;
  if(hasDraft){
    selfDraftEl.style.top='50%';
    selfDraftEl.style.transform='translate(-50%,-50%)';
    if(hasGhost){
      const dRect = selfDraftEl.getBoundingClientRect();
      const ghostTopPx = (vh/2) + (dRect.height/2) + spacing;
      typingGhostEl.style.top = (ghostTopPx / vh * 100) + '%';
      typingGhostEl.style.transform='translate(-50%,0)';
    } else {
      typingGhostEl.style.top='50%';
      typingGhostEl.style.transform='translate(-50%,-50%)';
    }
  } else if(hasGhost){
    typingGhostEl.style.top='50%';
    typingGhostEl.style.transform='translate(-50%,-50%)';
  } else {
    selfDraftEl.style.top='50%';
    selfDraftEl.style.transform='translate(-50%,-50%)';
    typingGhostEl.style.top='50%';
    typingGhostEl.style.transform='translate(-50%,-50%)';
  }
}

// skip/leave handlers now bound within bindRemoteActions() after remote initialization

// leaveChat removed (no longer used)

connect(); // establish socket but do not join until search
focusInput();
// Initial layout to center empty draft with caret
requestAnimationFrame(()=>{ updateDraft(); });

// Remote toggle behavior
remoteToggle.addEventListener('click', ()=>{
  const open = remotePanel.classList.toggle('open');
  remoteToggle.setAttribute('aria-expanded', open?'true':'false');
  remotePanel.setAttribute('aria-hidden', open?'false':'true');
  if(open){
    setTimeout(()=>{ if(focusActive){ overlayInput.focus(); } }, 180);
  }
});

// Basic placeholder remote actions
// Rebind skip/leave if panel dynamically replaced (defensive hot-reload scenario)
function bindRemoteActions(){
  skipBtn = document.getElementById('skipBtn');
  const searchBtn = document.getElementById('searchBtn');
  disconnectBtn = document.getElementById('disconnectBtn');
  searchBtnGlobal = searchBtn;
  leaveBtn = null;
  remoteTagInput = document.getElementById('remoteTagInput');
  remoteTagsDisplay = document.getElementById('remoteTagsDisplay');
  remoteRandomBtn = document.getElementById('remoteRandomBtn');
  remoteTagsBtn = document.getElementById('remoteTagsBtn');
  // removed guide control buttons
  if(skipBtn){
    skipBtn.onclick = ()=>{
      if(!ws || ws.readyState!==1){ return; }
      ws.send(JSON.stringify({type:'skip'}));
      setStatus('skipping...');
      typingGhostEl.textContent='';
      SOUND.skip();
  // matched tags bar removed
      // After skip, allow user to search again manually (disable skip until queue result returns)
      skipBtn.disabled = true;
      if(searchBtnGlobal){ searchBtnGlobal.disabled = false; }
    };
  }
  if(searchBtn){
    searchBtn.onclick = ()=>{
      if(!ws || ws.readyState!==1) return;
      if(searchBtn.disabled) return;
      // Auto-detect: if current mode random but tags present in input, switch to tag mode for this search
      const currentTags = collectRemoteTags();
      let effectiveMode = mode;
      if(currentTags.length && mode!=='tags'){
        effectiveMode = 'tags';
        mode='tags';
      }
  // matched tags bar removed
      if(effectiveMode==='tags'){
        tags = currentTags;
        sessionStorage.setItem('mode','tags');
        sessionStorage.setItem('tags', JSON.stringify(tags));
        ws.send(JSON.stringify({type:'join_with_tags', tags}));
        SOUND.searchingTags();
      } else {
        sessionStorage.setItem('mode','random');
        ws.send(JSON.stringify({type:'join'}));
        SOUND.searching();
      }
      setStatus('connecting...');
      enableSkip();
      searchBtn.disabled = true; // disable to prevent duplicate join
      if(disconnectBtn){ disconnectBtn.disabled = false; }
    };
  }
  if(disconnectBtn){
    disconnectBtn.onclick = ()=>{
      if(!ws || ws.readyState!==1){ return; }
      try{ ws.send(JSON.stringify({type:'disconnect'})); }catch(e){}
      try{ ws.close(); }catch(e){}
      chatId=null;
      setStatus('disconnected');
      if(searchBtnGlobal){ searchBtnGlobal.disabled = false; }
      if(skipBtn){ skipBtn.disabled = true; }
      if(disconnectBtn){ disconnectBtn.disabled = true; }
  // matched tags bar removed
      speakGuide('disconnected', {tts:true});
      // Reconnect socket fresh so user can search again quickly
      setTimeout(()=>{ connect(); }, 300);
    };
  }
  // leave button removed
  if(remoteTagInput){
    remoteTagInput.oninput = handleRemoteTagInput;
    // initialize with existing tags if mode was tag-based
    if(mode==='tags' && tags.length){
      remoteTagInput.value = tags.join(', ');
      renderRemoteTags();
    }
  }
  if(remoteRandomBtn){
    remoteRandomBtn.onclick = ()=>{
      mode='random';
      sessionStorage.setItem('mode','random');
      sessionStorage.removeItem('tags');
      remoteTagsBtn.disabled = remoteTagInput.value.trim().length===0;
      addSystemMessage('set mode: random', {autoHide:true});
    };
  }
  if(remoteTagsBtn){
    remoteTagsBtn.onclick = ()=>{
      const cleaned = collectRemoteTags();
      if(!cleaned.length){ return; }
      mode='tags';
      tags = cleaned;
      sessionStorage.setItem('mode','tags');
      sessionStorage.setItem('tags', JSON.stringify(tags));
      addSystemMessage('set mode: tags ('+tags.join(', ')+')', {autoHide:true});
    };
  }
  // speak a brief presence line after initial bind
  setTimeout(()=>{ speakGuide('Guide voice active. I will announce matches.', {tts:true}); }, 800);
  updateRemoteButtonsState();
}
bindRemoteActions();

function collectRemoteTags(){
  if(!remoteTagInput) return [];
  const raw = remoteTagInput.value.split(',');
  const cleaned = Array.from(new Set(raw.map(x=>x.trim().toLowerCase()).filter(Boolean)));
  return cleaned;
}
function renderRemoteTags(){
  if(!remoteTagsDisplay) return;
  const list = collectRemoteTags();
  remoteTagsDisplay.innerHTML='';
  list.forEach(t=>{
    const span=document.createElement('span');
    span.className='tag-pill';
    span.textContent=t;
    span.dataset.tagValue = t;
    remoteTagsDisplay.appendChild(span);
  });
  tags = list; // mirror local variable used by chat logic
  updateRemoteButtonsState();
  updateRemoteTagTooltips();
}
function handleRemoteTagInput(){
  renderRemoteTags();
}
function updateRemoteButtonsState(){
  if(!remoteTagsBtn || !remoteRandomBtn) return;
  const hasTags = collectRemoteTags().length>0;
  remoteTagsBtn.disabled = !hasTags;
  if(mode==='tags' && hasTags){
    remoteTagsBtn.classList.add('active-mode');
    remoteRandomBtn.classList.remove('active-mode');
  } else if(mode==='random'){
    remoteRandomBtn.classList.add('active-mode');
    remoteTagsBtn.classList.remove('active-mode');
  } else {
    remoteRandomBtn.classList.remove('active-mode');
    remoteTagsBtn.classList.remove('active-mode');
  }
}

function disableSkip(){ if(skipBtn){ skipBtn.disabled = true; } }
function enableSkip(){ if(skipBtn){ skipBtn.disabled = false; } }

function updateRemoteTagTooltips(){
  if(!remoteTagsDisplay) return;
  const nodes = remoteTagsDisplay.querySelectorAll('.tag-pill');
  nodes.forEach(n=>{
    const val = n.dataset.tagValue;
    const count = tagCounts[val] || 0;
    n.title = count === 1 ? '1 user has this tag' : count + ' users have this tag';
    n.classList.add('tag-openable');
    n.style.cursor='pointer';
    n.onclick = ()=> openTagCanvas(val);
  });
}

// renderMatchedTags removed (UI element deleted)
// ================= Tag Canvas Frontend =================
let tcoOverlay = document.getElementById('tagCanvasOverlay');
let tcoCanvas = document.getElementById('tcoCanvas');
let tcoClose = document.getElementById('tcoClose');
let tcoTagLabel = document.getElementById('tcoTagLabel');
let tcoParticipants = document.getElementById('tcoParticipants');
let tcoToolDraw = document.getElementById('tcoToolDraw');
let tcoToolErase = document.getElementById('tcoToolErase');
let tcoColor = document.getElementById('tcoColor');
let tcoWidth = document.getElementById('tcoWidth');

let currentTagCanvas = null;
let currentTool = 'draw';
let strokesCache = [];
// text notes removed
let drawing = false;
let strokePoints = [];
let strokeStartTime = 0;
let erasing = false; // track mousedown in erase mode

function setTool(tool){
  currentTool = tool;
  [tcoToolDraw,tcoToolErase].forEach(btn=>btn && btn.classList.remove('active'));
  if(tool==='draw' && tcoToolDraw) tcoToolDraw.classList.add('active');
  else if(tool==='erase' && tcoToolErase) tcoToolErase.classList.add('active');
}
if(tcoToolDraw) tcoToolDraw.onclick=()=>setTool('draw');
if(tcoToolErase) tcoToolErase.onclick=()=>setTool('erase');

function openTagCanvas(tag){
  if(!ws || ws.readyState!==1) return;
  currentTagCanvas = tag;
  strokesCache = [];
  if(tcoTagLabel) tcoTagLabel.textContent = '#' + tag;
  if(tcoOverlay){ tcoOverlay.dataset.active='true'; tcoOverlay.setAttribute('aria-hidden','false'); }
  resizeTagCanvas();
  ws.send(JSON.stringify({type:'open_tag_canvas', tag}));
}
function closeTagCanvas(){
  if(!currentTagCanvas) return;
  if(ws && ws.readyState===1){ ws.send(JSON.stringify({type:'close_tag_canvas', tag: currentTagCanvas})); }
  currentTagCanvas = null;
  if(tcoOverlay){ tcoOverlay.dataset.active='false'; tcoOverlay.setAttribute('aria-hidden','true'); }
  clearTagCanvasRender();
}
if(tcoClose) tcoClose.onclick=closeTagCanvas;
document.addEventListener('keydown', e=>{ if(e.key==='Escape' && currentTagCanvas){ closeTagCanvas(); }});

function resizeTagCanvas(){
  if(!tcoCanvas) return;
  const dpr = window.devicePixelRatio||1;
  tcoCanvas.width = tcoCanvas.clientWidth * dpr;
  tcoCanvas.height = tcoCanvas.clientHeight * dpr;
  const ctx = tcoCanvas.getContext('2d');
  ctx.scale(dpr,dpr);
  redrawTagCanvas();
}
window.addEventListener('resize', ()=>{ if(currentTagCanvas) resizeTagCanvas(); });

function clearTagCanvasRender(){
  if(tcoCanvas){ const ctx = tcoCanvas.getContext('2d'); ctx.clearRect(0,0,tcoCanvas.width,tcoCanvas.height); }
}
function redrawTagCanvas(){
  if(!tcoCanvas) return;
  const ctx = tcoCanvas.getContext('2d');
  ctx.clearRect(0,0,tcoCanvas.width,tcoCanvas.height);
  const w = tcoCanvas.clientWidth; const h = tcoCanvas.clientHeight;
  strokesCache.forEach(s=>{
    ctx.strokeStyle = s.color||'#fff'; ctx.lineWidth = s.w||2; ctx.lineJoin='round'; ctx.lineCap='round';
    const pts = s.points||[]; if(!pts.length) return; ctx.beginPath();
    pts.forEach((p,i)=>{ const x=p.x*w; const y=p.y*h; if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); });
    ctx.stroke();
  });
  // text notes removed
}
// renderTextNotes removed (text tool removed)

function canvasPointerDown(e){
  if(!currentTagCanvas) return;
  if(currentTool==='draw'){
    drawing=true; strokePoints=[]; strokeStartTime=performance.now(); addCanvasPoint(e);
  } else if(currentTool==='erase'){
    erasing = true; handleEraseAt(e);
  }
}
function canvasPointerMove(e){
  if(drawing){ addCanvasPoint(e); drawTempStroke(); }
  else if(erasing){ handleEraseAt(e); }
}
function canvasPointerUp(){
  if(drawing){ finalizeStroke(); }
  erasing=false;
}
function handleEraseAt(e){
  if(!tcoCanvas) return;
  const rect = tcoCanvas.getBoundingClientRect();
  const x = (e.clientX-rect.left)/rect.width;
  const y = (e.clientY-rect.top)/rect.height;
  const hit = hitTestStroke(x,y);
  if(hit){
    // Optimistic remove
    const idx = strokesCache.findIndex(s=>s.id===hit.id);
    if(idx>=0){ strokesCache.splice(idx,1); redrawTagCanvas(); }
    ws && ws.readyState===1 && ws.send(JSON.stringify({type:'tag_canvas_stroke_delete', tag: currentTagCanvas, id: hit.id}));
  }
}
function hitTestStroke(nx,ny){
  // Simple bounding box + distance to segment test
  const THRESH = 0.02; // normalized threshold
  let closest=null, closestDist=THRESH;
  strokesCache.forEach(s=>{
    const pts=s.points||[]; if(pts.length<2) return;
    for(let i=1;i<pts.length;i++){
      const a=pts[i-1], b=pts[i];
      // bounding box quick reject
      const minx=Math.min(a.x,b.x)-THRESH, maxx=Math.max(a.x,b.x)+THRESH;
      const miny=Math.min(a.y,b.y)-THRESH, maxy=Math.max(a.y,b.y)+THRESH;
      if(nx<minx||nx>maxx||ny<miny||ny>maxy) continue;
      // distance from point to segment
      const dx=b.x-a.x, dy=b.y-a.y;
      const len2=dx*dx+dy*dy; if(!len2) continue;
      let t=((nx-a.x)*dx+(ny-a.y)*dy)/len2; t=Math.max(0,Math.min(1,t));
      const px=a.x+dx*t, py=a.y+dy*t; const dd=Math.hypot(nx-px, ny-py);
      if(dd<closestDist){ closestDist=dd; closest=s; }
    }
  });
  return closest;
}
function canvasEventPoint(e){ const rect=tcoCanvas.getBoundingClientRect(); const x=(e.clientX-rect.left)/rect.width; const y=(e.clientY-rect.top)/rect.height; return {x:Math.min(1,Math.max(0,x)), y:Math.min(1,Math.max(0,y))}; }
function addCanvasPoint(e){ const pt=canvasEventPoint(e); const t=performance.now()-strokeStartTime; strokePoints.push({x:pt.x,y:pt.y,t:Math.round(t)}); }
function drawTempStroke(){ if(!tcoCanvas) return; const ctx=tcoCanvas.getContext('2d'); redrawTagCanvas(); const w=tcoCanvas.clientWidth; const h=tcoCanvas.clientHeight; ctx.strokeStyle=tcoColor.value||'#fff'; ctx.lineWidth=parseFloat(tcoWidth.value)||3; ctx.lineJoin='round'; ctx.lineCap='round'; const pts=strokePoints; if(!pts.length) return; ctx.beginPath(); pts.forEach((p,i)=>{ const x=p.x*w; const y=p.y*h; if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); }); ctx.stroke(); }
function finalizeStroke(){ drawing=false; if(!strokePoints.length) return; const stroke={color:tcoColor.value||'#fff', w:parseFloat(tcoWidth.value)||3, points: strokePoints.map(p=>({x:p.x,y:p.y,t:p.t}))}; ws&&ws.readyState===1&&ws.send(JSON.stringify({type:'tag_canvas_stroke', tag:currentTagCanvas, stroke})); strokePoints=[]; }
// Updated finalizeStroke with optimistic tmpId
function finalizeStroke(){
  drawing=false;
  if(!strokePoints.length) return;
  const tmpId = 'tmp_'+Math.random().toString(36).slice(2,9);
  const localStroke = { id: tmpId, tmpId, color: tcoColor.value||'#fff', w: parseFloat(tcoWidth.value)||3, points: strokePoints.map(p=>({x:p.x,y:p.y,t:p.t})) };
  strokesCache.push(localStroke);
  redrawTagCanvas();
  ws && ws.readyState===1 && ws.send(JSON.stringify({type:'tag_canvas_stroke', tag: currentTagCanvas, stroke:{ tmpId, color: localStroke.color, w: localStroke.w, points: localStroke.points }}));
  strokePoints=[];
}
if(tcoCanvas){ tcoCanvas.addEventListener('mousedown',canvasPointerDown); window.addEventListener('mousemove',canvasPointerMove); window.addEventListener('mouseup',canvasPointerUp); tcoCanvas.addEventListener('touchstart',e=>{const t=e.touches[0]; canvasPointerDown(t);}); tcoCanvas.addEventListener('touchmove',e=>{const t=e.touches[0]; canvasPointerMove(t);}); tcoCanvas.addEventListener('touchend',canvasPointerUp); }

function handleTagCanvasMessages(data){
  switch(data.type){
  case 'tag_canvas_snapshot': if(data.tag!==currentTagCanvas) return; strokesCache=(data.strokes||[]).map(s=>({...s})); resizeTagCanvas(); break;
    case 'tag_canvas_stroke':
      if(data.tag!==currentTagCanvas) return;
      // Reconcile optimistic stroke by tmpId
      if(data.stroke.tmpId){
        const idx = strokesCache.findIndex(s=>s.id===data.stroke.tmpId || s.tmpId===data.stroke.tmpId);
        if(idx>=0){ strokesCache[idx] = data.stroke; } else { strokesCache.push(data.stroke); }
      } else {
        strokesCache.push(data.stroke);
      }
      if(strokesCache.length>500) strokesCache=strokesCache.slice(-500);
      redrawTagCanvas();
      break;
    case 'tag_canvas_stroke_delete':
      if(data.tag!==currentTagCanvas) return;
      const idx = strokesCache.findIndex(s=>s.id===data.id);
      if(idx>=0){ strokesCache.splice(idx,1); redrawTagCanvas(); }
      break;
    case 'tag_canvas_participants': if(data.tag===currentTagCanvas && tcoParticipants){ tcoParticipants.textContent=String(data.count); } break;
  }
}

// Monkey-patch existing ws.onmessage switch by wrapping handle creation after load (simpler: intercept global WebSocket messages via original handler).
// Because we directly edit the switch earlier, we append a global listener via window for fallback.
// We'll override connect to call processTagCanvas inside switch; easier path: patch switch? For speed, add observer below using Mutation of ws? Not needed now.

// Append global event hooking for already processed messages: intercept console debug? We'll add a listener on WebSocket prototype not safe; leaving utility for manual call if integrated later.

