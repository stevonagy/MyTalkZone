// =======================
// DeSo Login & Logout + Name Autofill/Hide
// =======================
const popupSize = { w: 800, h: 600 };
let loginPopup = null;
let loggedInPublicKey = null;
let desoUsername = null;

function centerPopup() {
  const x = window.outerWidth / 2 - popupSize.w / 2;
  const y = window.outerHeight / 2 - popupSize.h / 2;
  return `width=${popupSize.w},height=${popupSize.h},left=${x},top=${y}`;
}

function els(scope) {
  // scope: "default" (Create Room) or "username" (Username step)
  if (scope === 'username') {
    return {
      user: document.getElementById("deso-user-username"),
      wallet: document.getElementById("wallet-info-username"),
      login: document.getElementById("deso-login-username"),
      logout: document.getElementById("deso-logout-username"),
      nameWrap: document.getElementById("username-wrap"),
      nameInput: document.getElementById("username"),
    };
  }
  return {
    user: document.getElementById("deso-user"),
    wallet: document.getElementById("wallet-info"),
    login: document.getElementById("deso-login"),
    logout: document.getElementById("deso-logout"),
    nameWrap: document.getElementById("your-name-wrap"),
    nameInput: document.getElementById("your-name"),
  };
}

function setYourNameField(name) {
  // Fill both screens if present
  const a = els('default').nameInput;
  const b = els('username').nameInput;
  if (a) a.value = name;
  if (b) b.value = name;

  // Persist so rtc.js can proceed
  sessionStorage.setItem('username', name);
}

function toggleNameFieldVisibility(loggedIn) {
  // Hide "Your Name" inputs when logged in with DeSo, show when logged out
  ["default","username"].forEach(scope => {
    const { nameWrap } = els(scope);
    if (!nameWrap) return;
    nameWrap.style.display = loggedIn ? 'none' : '';
  });
}

function showLoggedOutUI() {
  ["default","username"].forEach(scope => {
    const { user, wallet, login, logout } = els(scope);
    if (user) user.innerText = "";
    if (wallet) { wallet.style.display = "none"; wallet.innerHTML = ""; }
    if (logout) logout.style.display = "none";
    if (login) login.style.display = "inline-block";
  });
  toggleNameFieldVisibility(false);
}

function showLoggedInUI(publicKey) {
  ["default","username"].forEach(scope => {
    const { user, wallet, login, logout } = els(scope);
    if (user) user.innerText = `Logged in: ${publicKey}`;
    if (logout) logout.style.display = "inline-block";
    if (login) login.style.display = "none";
    if (wallet) wallet.style.display = "block";
  });
  toggleNameFieldVisibility(true);
}

// ---- Logout handshake: trigger RTC cleanup, then redirect ----
function triggerAppLogout() {
  try {
    localStorage.removeItem("deso_user_key");
    localStorage.removeItem("deso_identity_users");
    sessionStorage.clear();
  } catch {}
  // Ask rtc.js to clean up call first
  window.dispatchEvent(new Event('deso:logout'));
  // Fallback redirect if rtc.js isn't active
  setTimeout(() => {
    if (!window.__rtcCleaned) window.location.href = "/";
  }, 800);
}

// Wire login buttons (both screens)
["default","username"].forEach(scope => {
  const { login } = els(scope);
  if (!login) return;
  login.addEventListener('click', () => {
    loginPopup = window.open(
      'https://identity.deso.org/log-in?accessLevelRequest=2',
      'DeSoLogin',
      centerPopup()
    );
    const { user } = els(scope);
    if (user) user.innerText = 'Waiting for login...';
  });
});

// Wire logout buttons (both pre-call screens)
["default","username"].forEach(scope => {
  const { logout } = els(scope);
  if (logout) logout.addEventListener('click', triggerAppLogout);
});

// In-call navbar logout button
const logoutCallBtn = document.getElementById("deso-logout-call");
if (logoutCallBtn) logoutCallBtn.onclick = triggerAppLogout;

// Handle Identity messages
window.addEventListener("message", (event) => {
  if (event.data?.service !== "identity") return;
  const { id, method, payload, service } = event.data;

  if (method === "initialize") {
    try {
      if (loginPopup && !loginPopup.closed) {
        loginPopup.postMessage({ id, service, payload: {} }, event.origin || "*");
      }
    } catch {}
    try {
      const approvePopup = window.__desoApprovePopup;
      if (approvePopup && !approvePopup.closed) {
        approvePopup.postMessage({ id, service, payload: {} }, event.origin || "*");
      }
    } catch {}
  }

  if (method === "login" && payload?.publicKeyAdded) {
    const publicKey = payload.publicKeyAdded;
    loggedInPublicKey = publicKey;
    localStorage.setItem("deso_user_key", publicKey);
    if (payload?.users) {
      localStorage.setItem("deso_identity_users", JSON.stringify(payload.users));
    }
    showLoggedInUI(publicKey);

    // Let rtc.js know it can proceed without leaving this page
    window.dispatchEvent(new Event('deso:login-success'));

    loginPopup?.close();
    fetchUserProfile(publicKey);
  }
});

// On load, hydrate UI from stored key
window.addEventListener("load", () => {
  const savedKey = localStorage.getItem("deso_user_key");
  if (savedKey) {
    loggedInPublicKey = savedKey;
    showLoggedInUI(savedKey);
    fetchUserProfile(savedKey);
  } else {
    showLoggedOutUI();
  }
});

// Fetch profile + balance, fill wallet UI, autofill name
async function fetchUserProfile(publicKey) {
  try {
    const profileRes = await fetch("https://node.deso.org/api/v0/get-single-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ PublicKeyBase58Check: publicKey })
    });
    const profileJson = await profileRes.json();
    desoUsername = profileJson?.Profile?.Username || publicKey;
    try {
      const cleanUsername = String(desoUsername || '').trim().replace(/^@+/, '');
      if (cleanUsername) {
        localStorage.setItem('deso_username', cleanUsername);
        localStorage.setItem(`deso_username:${publicKey}`, cleanUsername);
      }
    } catch {}

    const balanceRes = await fetch("https://node.deso.org/api/v0/get-users-stateless", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ PublicKeysBase58Check: [publicKey], SkipForLeaderboard: true })
    });
    const balanceJson = await balanceRes.json();

    const user = balanceJson.UserList?.[0];
    const nanos = user?.BalanceNanos ?? null;
    const desoBalance = nanos !== null ? (nanos / 1e9).toFixed(4) : "N/A";

    const profilePic = profileJson?.Profile?.ProfilePic ||
      "https://node.deso.org/assets/img/default_profile_pic.png";

    ["default","username"].forEach(scope => {
      const { wallet } = els(scope);
      if (wallet) {
        wallet.style.display = "block";
        wallet.innerHTML = `
          <p><strong>Username:</strong> @${desoUsername}</p>
          <p><img src="${profilePic}" width="60" height="60" style="border-radius:50%;" alt="Profile Pic"/></p>
          <p><strong>Balance:</strong> ${desoBalance} $DESO</p>
        `;
      }
    });

    setYourNameField(desoUsername);
    toggleNameFieldVisibility(true);
  } catch (err) {
    console.error("Error fetching profile or balance:", err);
    ["default","username"].forEach(scope => {
      const { wallet } = els(scope);
      if (wallet) wallet.innerHTML = `<p>Error loading user info.</p>`;
    });
  }
}

