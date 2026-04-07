const alertBox = document.getElementById('alert');
const listEl = document.getElementById('list');
const masterEl = document.getElementById('master');
const newpkEl = document.getElementById('newpk');
const addBtn = document.getElementById('add');
const saveBtn = document.getElementById('save');
const audioOnlyAboveEl = document.getElementById('audioOnlyAbove');

let state = {
  master: '',
  allowedCreators: [],
  audioOnlyAbove: 8,
};

function getCurrentPubKey() {
  return String(localStorage.getItem('deso_user_key') || '').trim();
}

function setAlert(msg, kind = 'info') {
  if (!alertBox) return;
  alertBox.className = `alert alert-${kind}`;
  alertBox.textContent = msg;
  alertBox.classList.remove('d-none');
}

function disableEditing() {
  [newpkEl, addBtn, saveBtn, audioOnlyAboveEl].forEach((el) => {
    if (el) el.disabled = true;
  });
}

function enableEditing() {
  [newpkEl, addBtn, saveBtn, audioOnlyAboveEl].forEach((el) => {
    if (el) el.disabled = false;
  });
}

function normalizePkList(values = []) {
  const seen = new Set();
  const out = [];

  values.forEach((value) => {
    const pk = String(value || '').trim();
    if (!pk || pk === state.master || seen.has(pk)) return;
    seen.add(pk);
    out.push(pk);
  });

  return out;
}

function renderList() {
  if (!listEl) return;
  listEl.innerHTML = '';

  const creators = normalizePkList(state.allowedCreators);
  state.allowedCreators = creators;

  if (!creators.length) {
    const empty = document.createElement('li');
    empty.className = 'list-group-item text-muted';
    empty.textContent = 'No additional creators.';
    listEl.appendChild(empty);
    return;
  }

  creators.forEach((pk) => {
    const li = document.createElement('li');
    li.className = 'list-group-item d-flex justify-content-between align-items-center';

    const text = document.createElement('span');
    text.className = 'text-break pr-2';
    text.textContent = pk;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-sm btn-outline-danger';
    btn.textContent = 'Remove';
    btn.addEventListener('click', () => {
      state.allowedCreators = state.allowedCreators.filter((value) => value !== pk);
      renderList();
    });

    li.appendChild(text);
    li.appendChild(btn);
    listEl.appendChild(li);
  });
}

function isValidDesoPk(value = '') {
  return /^BC1[0-9A-Za-z]{30,}$/.test(String(value).trim());
}

function getAudioOnlyAboveValue() {
  const raw = Number(audioOnlyAboveEl?.value ?? state.audioOnlyAbove ?? 8);
  if (!Number.isFinite(raw)) return 8;
  return Math.max(0, Math.floor(raw));
}

function applyPolicy(json = {}) {
  state.master = String(json.MASTER_PUBLIC_KEY || json.master || '').trim();
  state.allowedCreators = normalizePkList(json.ALLOWED_CREATORS || json.allowedCreators || []);
  state.audioOnlyAbove = Number.isFinite(Number(json.AUDIO_ONLY_ABOVE ?? json.audioOnlyAbove))
    ? Math.max(0, Math.floor(Number(json.AUDIO_ONLY_ABOVE ?? json.audioOnlyAbove)))
    : 8;

  if (masterEl) masterEl.value = state.master;
  if (audioOnlyAboveEl) audioOnlyAboveEl.value = String(state.audioOnlyAbove);
  renderList();
}

async function fetchPolicy() {
  const pk = getCurrentPubKey();
  if (!pk) {
    disableEditing();
    setAlert('Nisi prijavljen na DeSo. Ulogiraj se pa pokušaj ponovo.', 'warning');
    return;
  }

  try {
    const res = await fetch('/api/policy', {
      headers: { 'x-deso-pubkey': pk },
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      disableEditing();
      setAlert(`Pristup odbijen ili greška (${res.status}). ${txt || ''}`.trim(), 'danger');
      return;
    }

    const json = await res.json();
    applyPolicy(json);
    enableEditing();
    setAlert('Policy učitan.', 'success');
  } catch (err) {
    console.error(err);
    disableEditing();
    setAlert('Greška pri dohvaćanju policyja.', 'danger');
  }
}

function handleAddCreator() {
  const value = String(newpkEl?.value || '').trim();
  if (!value) return;

  if (!isValidDesoPk(value)) {
    setAlert('Neispravan DeSo public key (mora početi s "BC1" i imati dovoljno znakova).', 'warning');
    return;
  }

  if (value === state.master || state.allowedCreators.includes(value)) {
    setAlert('Taj public key je već na listi ili je master key.', 'info');
    newpkEl.value = '';
    return;
  }

  state.allowedCreators.push(value);
  newpkEl.value = '';
  renderList();
  setAlert('Creator added. Klikni “Save changes” za spremanje.', 'info');
}

async function handleSave() {
  const pk = getCurrentPubKey();
  if (!pk) {
    disableEditing();
    setAlert('Nisi prijavljen na DeSo. Ulogiraj se pa pokušaj ponovo.', 'warning');
    return;
  }

  const payload = {
    allowedCreators: normalizePkList(state.allowedCreators),
    audioOnlyAbove: getAudioOnlyAboveValue(),
  };

  try {
    const res = await fetch('/api/policy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-deso-pubkey': pk,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      setAlert(`Spremanje nije uspjelo (${res.status}). ${txt || ''}`.trim(), 'danger');
      return;
    }

    const json = await res.json();
    applyPolicy(json);
    enableEditing();
    setAlert('Uspješno spremljeno!', 'success');
  } catch (err) {
    console.error(err);
    setAlert('Greška pri spremanju.', 'danger');
  }
}

addBtn?.addEventListener('click', handleAddCreator);
newpkEl?.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  handleAddCreator();
});
saveBtn?.addEventListener('click', handleSave);

window.addEventListener('deso:login-success', fetchPolicy);
window.addEventListener('deso:logout', () => {
  disableEditing();
  setAlert('Odjavljen si s DeSo računa.', 'info');
});

// početno stanje

disableEditing();
fetchPolicy();
