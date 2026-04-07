# MyTalkZone v3.0

Browser-based decentralized real-time video meetings with **Node.js**, **Socket.IO**, **WebRTC**, and **DeSo-based identity**.

**Credits**  
Developed by: **Stevo Nagy & ChatGPT (OpenAI)**  
Base version: **MyTalkZone v1.4**

---

## Overview

MyTalkZone is a browser-based live communication platform for creating and joining video rooms directly from the browser. It combines WebRTC peer-to-peer media, Socket.IO signaling, TURN/STUN connectivity support, and DeSo-linked identity for usernames and profile context.

From **v2.0 onward**, the app is integrated with **DeSo** for authentication, usernames, and profile avatars. In **v3.0**, the project adds a cleaner admin flow, visible participant name labels in live rooms, policy-linked audio-only scaling, and a more polished hub/call experience.

---

## What's New in v3.0

### 1. Admin cleanup and policy flow improvements
- Cleaned up the **Admin** page structure.
- Removed duplicated/conflicting admin-side logic.
- Improved save flow for:
  - **Allowed creators**
  - **Audio-only above N participants**
- Restored a clear **Exit** button in the admin page.

### 2. Participant name labels inside live rooms
- Participants are now displayed directly on video tiles using their **DeSo username**.
- Local participant label is shown as a local badge.
- Remote participant labels are synchronized when users join or rejoin a room.
- Username labels are intentionally kept out of the visible chat feed and handled as internal signaling metadata.

### 3. Audio-only scaling linked to admin policy
- The audio-only threshold is no longer just a frontend hardcoded value.
- The live room now uses the **policy-defined** `audioOnlyAbove` value set in Admin.
- This keeps scaling behavior aligned with the current room policy.

### 4. Hub polish and versioning
- Updated hub branding to **MyTalkZone v3.0**.
- Added a version/update note in the Hub.
- Maintained the DeSo login-based room creation gate for whitelisted users.

### 5. Call UI polish
- Cleaner participant badges.
- Removed the red unread notification dot from the chat icon.
- Improved chat drawer layout and general visual consistency.

---

## Version History

## v3.0 — Admin, identity labels, and policy-linked scaling
This release focuses on stability, room visibility, and better day-to-day usability.

### Highlights
- Admin page cleanup
- Stable allowed-creators editing flow
- Policy-linked audio-only threshold
- In-room participant username badges
- Hub branding update to **v3.0**
- Improved call UI polish
- Hidden chat notification dot

---

## v2.0 — DeSo integration & UI enhancements
This release introduced blockchain-linked identity, avatars, and improved user experience across both Hub and call views.

### Main features
- DeSo username display
- DeSo profile avatars in room cards
- Room title display in the top bar
- Stable room creation and join synchronization
- Cleaner UI across hub and room views
- No dependency on external profile fetches during room creation; client session data is reused

---

## v1.5 — Dynamic video scaling
This release introduced adaptive quality scaling based on room size.

### Scale profiles
- **1–8 participants**: 720p @ 30fps, ~1800 kbps
- **9–14 participants**: 540p @ 24fps, ~1200 kbps
- **15+ participants**: 360p @ 20fps, ~600 kbps
- Optional **audio-only mode** when participants exceed the configured threshold

> In v3.0, the threshold is tied to admin policy rather than relying only on a frontend constant.

---

## v1.4 — Stable base release
The first solid production-style version of the platform, featuring:
- Multi-room video meetings
- TURN/STUN connectivity support
- Socket.IO signaling
- WebRTC peer-to-peer media
- Responsive browser UI for desktop and mobile

---

## Core Features

- Browser-based real-time video rooms
- DeSo login and identity-aware room usage
- Whitelist-based room creation policy
- In-room live chat
- TURN/STUN fallback for NAT and firewall traversal
- Dynamic video quality scaling
- Optional audio-only behavior for larger rooms
- Hub page for browsing, searching, and joining active rooms
- Admin page for creator policy management

---

## Project Structure

```text
MyTalkZone3.0/
├── src/
│   ├── app.js                 # Main server entry point
│   ├── hub.html               # Rooms hub UI
│   ├── admin.html             # Admin UI for policy management
│   ├── ws/
│   │   ├── stream.js          # Socket / signaling handlers
│   │   └── roomsStore.js      # In-memory room metadata store
│   ├── assets/
│   │   ├── js/
│   │   │   ├── rtc.js         # WebRTC, signaling, participant labels, scaling
│   │   │   ├── hub.js         # Hub room listing/search/join UI
│   │   │   ├── admin.js       # Admin policy editor logic
│   │   │   ├── deso.js        # DeSo login/session helpers
│   │   │   └── helpers.js     # Shared client helpers
│   │   ├── css/
│   │   │   └── app.css        # Shared app styling
│   │   └── img/               # Static images/icons
├── package.json               # Node.js dependencies
└── README.md                  # Project documentation
```

---

## High-Level Flow

1. User opens the application in the browser.
2. User logs in with a **DeSo account**.
3. User browses the hub or opens a room directly.
4. Server validates room creation rights based on policy.
5. Client connects to the server through **Socket.IO** signaling.
6. Peers negotiate **WebRTC** connections.
7. Media streams flow peer-to-peer, with **TURN** fallback when needed.
8. Room UI shows participant identity badges using DeSo usernames.
9. Scaling logic adjusts quality and can switch to audio-only mode based on policy.

---

## Data Storage

### Server
- `roomPolicy.json` — stores the master key, allowed creators, and audio-only threshold
- `roomsStore.js` — keeps an in-memory list of active rooms and runtime metadata

### Browser
- `localStorage["deso_user_key"]` — DeSo public key
- `sessionStorage["username"]` — DeSo username used in the current browser session

---

## Main Routes

- `/` — Main app / room entry flow
- `/hub` — Browse, search, and join active rooms
- `/admin` — Admin interface for master policy management
- `/api/policy` — Get/update room policy
- `/api/rooms` — Active room listing used by the hub and room checks

---

## Quick Start

```bash
npm install
node src/app.js
```

Open in browser:

```text
/        -> main app / room flow
/hub     -> rooms hub
/admin   -> admin policy page
```

---

## Deployment Notes

Typical production setup used in this project:
- Ubuntu / DigitalOcean droplet
- Node.js
- PM2
- Nginx reverse proxy
- HTTPS via Certbot / Let's Encrypt
- TURN server for WebRTC fallback

If deploying by copy script or ZIP, make sure the app lands with this structure:

```text
<deploy-root>/src/app.js
<deploy-root>/src/hub.html
<deploy-root>/src/assets/...
```

Avoid deploying with an extra nested folder level such as:

```text
<deploy-root>/MyTalkZone3.0/src/...
```

because PM2 may still expect:

```text
<deploy-root>/src/app.js
```

---

## Notes

- Room creation is intentionally restricted to whitelisted DeSo users.
- Participant labels improve room clarity without polluting visible chat history.
- Audio-only behavior can be tuned from the admin interface.
- TURN credentials and infrastructure remain deployment-specific.

---

## License / Usage

Add your preferred license here if the project will be published publicly on GitHub.
