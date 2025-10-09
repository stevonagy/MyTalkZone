// assets/js/chat-ui.js
const chatPane   = document.getElementById('chat-pane');
const toggleBtn  = document.getElementById('toggle-chat-pane');
const closeBtn   = document.getElementById('close-chat-pane');
const chatBadge  = document.getElementById('new-chat-notification');

function isChatOpen(){ return chatPane && !chatPane.hasAttribute('hidden'); }
function showBadge(){ chatBadge?.removeAttribute('hidden'); }
function hideBadge(){ chatBadge?.setAttribute('hidden', ''); }

function openChat(){
  chatPane?.removeAttribute('hidden');
  hideBadge();
}
function closeChat(){
  chatPane?.setAttribute('hidden', '');
}

toggleBtn?.addEventListener('click', (e)=>{
  e.preventDefault();
  if (isChatOpen()) closeChat(); else openChat();
});

closeBtn?.addEventListener('click', (e)=>{
  e.preventDefault();
  closeChat();
});

// Izvezi mini-API da ga rtc.js može pozvati kad stigne poruka
window.__chatUI = {
  onIncomingMessage(){
    if (!isChatOpen()) showBadge();
  },
  openChat, closeChat, isChatOpen
};
