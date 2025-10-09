// src/assets/js/stage.js
function byId(id){ return document.getElementById(id); }

const stageEl   = byId('stage');
/** @type {HTMLVideoElement|null} */
const stageVideo= byId('stage-video');

function isScreenStream(stream){
  try{
    const vt = stream?.getVideoTracks?.()[0];
    if (!vt) return false;
    const st = vt.getSettings ? vt.getSettings() : {};
    if (st && typeof st.displaySurface !== 'undefined') return true;
    const lbl = (vt.label || '').toLowerCase();
    if (/screen|display|window|monitor|tab|present/.test(lbl)) return true;
    if ((vt.contentHint || '').toLowerCase() === 'detail') return true;
    return false;
  }catch{ return false; }
}

function setStage(stream, owner=''){
  if (!stageEl || !stageVideo || !stream) return;
  if (stageVideo.srcObject !== stream) stageVideo.srcObject = stream;
  stageVideo.onloadedmetadata = () => { try { stageVideo.play(); } catch {} };
  stageEl.dataset.owner = owner || '';
  stageEl.hidden = false;
  document.body.classList.add('has-stage');
}
function clearStage(owner=''){
  if (!stageEl || !stageVideo) return;
  if (owner && stageEl.dataset.owner && stageEl.dataset.owner !== owner) return;
  try { stageVideo.srcObject = null; } catch {}
  stageEl.dataset.owner = '';
  stageEl.hidden = true;
  document.body.classList.remove('has-stage');
}
window._stage = { setStage, clearStage, isScreenStream };

(function patchGetDisplay(){
  const md = navigator.mediaDevices;
  if (!md || typeof md.getDisplayMedia !== 'function') return;
  const orig = md.getDisplayMedia.bind(md);
  md.getDisplayMedia = async function(constraints){
    const stream = await orig(constraints);
    setStage(stream, 'local');
    const vt = stream.getVideoTracks?.()[0];
    if (vt) vt.addEventListener('ended', () => clearStage('local'), { once:true });
    return stream;
  };
})();

const observeRemoteVideos = (() => {
  const seen = new WeakSet();
  function inspectVideo(v){
    if (!v || seen.has(v)) return;
    const tryAttach = () => {
      try {
        const so = v.srcObject || null;
        if (so && so.getVideoTracks && so.getVideoTracks().length) {
          if (isScreenStream(so)) {
            const owner = v.id || v.closest('[id]')?.id || 'remote';
            setStage(so, owner);
            const track = so.getVideoTracks()[0];
            track?.addEventListener('ended', () => clearStage(owner), { once:true });
          }
          seen.add(v);
        }
      } catch {}
    };
    let tries = 0;
    const t = setInterval(() => {
      if (tries++ > 20) { clearInterval(t); return; }
      if (v.srcObject) { tryAttach(); clearInterval(t); }
    }, 150);
  }
  function scan(container){ container.querySelectorAll('video').forEach(inspectVideo); }
  return function init(){
    const grid = byId('videos') || document.body;
    scan(grid);
    const gridObs = new MutationObserver((muts) => {
      muts.forEach(m => {
        m.addedNodes?.forEach(node => {
          if (node.nodeType === 1) {
            node.querySelectorAll?.('video')?.forEach(inspectVideo);
            if (node instanceof HTMLVideoElement) inspectVideo(node);
          }
        });
      });
    });
    gridObs.observe(grid, { childList:true, subtree:true });
  };
})();

document.addEventListener('DOMContentLoaded', observeRemoteVideos);
window.addEventListener('beforeunload', () => { try { clearStage(); } catch {} });
