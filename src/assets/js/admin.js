// Admin UI — koristi DeSo login key iz localStorage
const alertBox = document.getElementById('alert');
const listEl   = document.getElementById('list');
const masterEl = document.getElementById('master');
const newpkEl  = document.getElementById('newpk');
const addBtn   = document.getElementById('add');
const saveBtn  = document.getElementById('save');

let state = { master: '', allowedCreators: [], audioOnlyAbove: 8 };

function showAlert(msg, kind='info') {
  alertBox.className = `alert alert-${kind}`;
  alertBox.textContent = msg;
  alertBox.classList.remove('d-none');
}

function disableEditing() {
  if (newpkEl) newpkEl.disabled = true;
  if (addBtn) addBtn.disabled = true;
  if (saveBtn) saveBtn.disabled = true;
}

function enableEditing() {
  if (newpkEl) newpkEl.disabled = false;
  if (addBtn) addBtn.disabled = false;
  if (saveBtn) saveBtn.disabled = false;
}

function renderList() {
  listEl.innerHTML = '';
  (state.allowedCreators || [])
    .filter(pk => pk !== state.master)
    .forEach(pk => {
      const li = document.createElement('li');
      li.className = 'list-group-item d-flex justify-content-between align-items-center';
      li.textContent = pk;
      const btn = document.createElement('button');
      btn.className = 'btn btn-sm btn-outline-danger';
      btn.textContent = 'Remove';
      btn.onclick = () => {
        state.allowedCreators = state.allowedCreators.filter(x => x !== pk);
        renderList();
      };
      li.appendChild(btn);
      listEl.appendChild(li);
    });
}

function isValidDesoPk(v='') {
  return /^BC1[0-9A-Za-z]{30,}$/.test(v.trim());
}

async function fetchPolicy() {
  try {
    const pk = (localStorage.getItem('deso_user_key') || '').trim();
    if (!pk) {
      showAlert('Nisi prijavljen na DeSo. Ulogiraj se pa pokušaj ponovo.', 'warning');
      disableEditing();
      return;
    }

    const res = await fetch('/api/policy', { headers: { 'x-deso-pubkey': pk } });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      showAlert(`Pristup odbijen ili greška (${res.status}). ${txt || ''}`.trim(), 'danger');
      disableEditing();
      return;
    }

    const json = await res.json();
    state = {
      master: (json.MASTER_PUBLIC_KEY || json.master || '').trim(),
      allowedCreators: Array.from(new Set([...(json.ALLOWED_CREATORS || json.allowedCreators || [])]))
    };

    if (masterEl) masterEl.value = state.master || '';
    renderList();
    enableEditing();
    showAlert('Policy učitan.', 'success');
  } catch (e) {
    console.error(e);
    showAlert('Greška pri dohvaćanju policyja.', 'danger');
    disableEditing();
  }
}

if (addBtn) addBtn.onclick = () => {
  const v = (newpkEl.value || '').trim();
  if (!v) return;
  if (!isValidDesoPk(v)) {
    showAlert('Neispravan DeSo public key (mora početi s "BC1" i imati dovoljno znakova).', 'warning');
    return;
  }
  if (state.allowedCreators.includes(v)) return;
  state.allowedCreators.push(v);
  newpkEl.value = '';
  renderList();
};

if (saveBtn) saveBtn.onclick = async () => {
  try {
    const pk = (localStorage.getItem('deso_user_key') || '').trim();
    const res = await fetch('/api/policy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-deso-pubkey': pk
      },
      body: JSON.stringify({ allowedCreators: state.allowedCreators })
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      showAlert(`Spremanje nije uspjelo (${res.status}). ${txt || ''}`.trim(), 'danger');
      return;
    }

    const saved = await res.json();
    state = {
      master: (saved.MASTER_PUBLIC_KEY || saved.master || '').trim(),
      allowedCreators: Array.from(new Set([...(saved.ALLOWED_CREATORS || saved.allowedCreators || [])]))
    };
    renderList();
    showAlert('Uspješno spremljeno!', 'success');
  } catch (e) {
    console.error(e);
    showAlert('Greška pri spremanju.', 'danger');
  }
};

// nakon logina — ponovno učitaj policy
window.addEventListener('deso:login-success', () => {
  fetchPolicy();
});

// inicijalni dohvat
fetchPolicy();


// --- audioOnlyAbove wiring (added in v1.5 updates) ---
(function(){
  const audioInput = document.getElementById('audioOnlyAbove');
  async function refreshAudioValFromState() {
    try {
      const headers = { 'x-deso-pubkey': localStorage.getItem('deso_pubkey') || '' };
      const r = await fetch('/api/policy', { headers });
      if (r.ok) {
        const d = await r.json();
        if (audioInput) audioInput.value = Number(d.AUDIO_ONLY_ABOVE || d.audioOnlyAbove || 8);
      }
    } catch {}
  }
  window.addEventListener('deso:login-success', refreshAudioValFromState);
  refreshAudioValFromState();

  if (saveBtn) saveBtn.addEventListener('click', async (e) => {
    try {
      e.preventDefault();
      const headers = {
        'Content-Type': 'application/json',
        'x-deso-pubkey': localStorage.getItem('deso_pubkey') || ''
      };
      const creators = Array.from(document.querySelectorAll('#list input[type="text"]')).map(i => i.value.trim()).filter(Boolean);
      const body = { allowedCreators: creators, audioOnlyAbove: Number(audioInput?.value || 8) };
      const res = await fetch('/api/policy', { method: 'POST', headers, body: JSON.stringify(body) });
      const js  = await res.json();
      if (!res.ok) throw new Error(js.error || 'save_error');
      if (audioInput) audioInput.value = Number(js.AUDIO_ONLY_ABOVE || js.audioOnlyAbove || 8);
      showAlert('Uspješno spremljeno!', 'success');
    } catch (err) {
      console.error(err);
      showAlert('Greška pri spremanju.', 'danger');
    }
  }, { once: true });
})();
