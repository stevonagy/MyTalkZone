# MyTalkZone v3.0

Browser-based decentralized real-time video meetings built with **Node.js**, **Socket.IO**, **WebRTC**, and **DeSo-based identity**.

**Credits**  
Developed by: **Stevo Nagy & ChatGPT (OpenAI)**  
Base version: **MyTalkZone v1.4**

---

## Overview

MyTalkZone is a browser-based live communication platform for creating and joining video rooms directly from the browser. It combines WebRTC peer-to-peer media, Socket.IO signaling, TURN/STUN connectivity support, and DeSo-linked identity for usernames, profile avatars, and meeting invite posts.

From **v2.0 onward**, the app is integrated with **DeSo** for authentication, usernames, and profile context. In the latest **v3.0** build, the project adds:

- scheduled meetings
- DeSo invite posting
- 10-minute reminder posting
- time-gated meeting entry
- a waiting/join page for scheduled calls
- automatic cleanup of upcoming meetings once the room becomes live
- Europe/Zagreb + UTC time display for meeting information

---

## What’s New in the Latest v3.0 Build

### 1. Scheduled meetings
Whitelisted creators can now schedule meetings in advance from the Hub.

Each meeting stores:
- title
- description
- room ID
- start time
- duration
- tagged DeSo usernames
- creator metadata
- invite/reminder post hashes

Meetings are persisted in `src/ws/meetings.json`, so they survive server restarts.

### 2. DeSo invite posts
After creating a scheduled meeting, the creator can publish an invite post to DeSo.

The invite post includes:
- meeting title
- scheduled time
- duration
- join link
- description
- tagged participants

The post is signed through the DeSo approval flow and only marked as posted after a successful blockchain submission.

### 3. Reminder posts
Starting **10 minutes before the meeting**, the creator or master admin can publish a reminder post.

Rules:
- reminder is available only if the initial invite was already posted
- reminder can be posted only once
- reminder remains available until the meeting ends

### 4. Time-gated access to scheduled meetings
Scheduled meetings cannot be opened at any time.

Join rules:
- entry opens **15 minutes before the scheduled start**
- entry remains open during the meeting
- entry remains open for a limited grace period after the meeting ends

If a user opens the join link too early, the `/call` page shows a waiting screen instead of joining immediately.

### 5. Waiting page for early arrivals
If someone opens a scheduled meeting before the join window, the call page displays:
- a scheduled meeting notice
- join opening time
- meeting start time
- countdown to join opening
- countdown to meeting start
- a **Join meeting** button that appears when access becomes available

### 6. Live room / upcoming meeting cleanup
Once the first participant enters and the scheduled meeting becomes a real live room:
- the meeting remains visible in **Live rooms**
- it is automatically hidden from **Upcoming meetings**

This avoids showing the same meeting twice.

### 7. Europe/Zagreb + UTC meeting times
Scheduled meeting cards now display times in both:
- `Europe/Zagreb`
- `UTC`

This applies to:
- meeting start time
- join opening time
- invite posted time
- reminder posted time

### 8. Existing v3.0 improvements retained
The latest build still includes the previously added v3.0 improvements:
- DeSo username labels on video tiles
- admin cleanup and policy editing
- policy-linked audio-only scaling
- improved Hub and Call UI polish

---

## Core Features

- Browser-based real-time video rooms
- WebRTC peer-to-peer audio/video
- Socket.IO signaling
- DeSo login and identity-aware room usage
- Whitelist-based room creation and meeting scheduling
- In-room participant name badges
- In-room live chat
- TURN/STUN fallback for NAT and firewall traversal
- Dynamic video quality scaling
- Optional audio-only behavior for larger rooms
- Hub page for browsing, searching, and joining live rooms
- Admin page for creator policy management
- Scheduled meetings with persistence
- DeSo invite and reminder post flow

---

## Project Structure

```text
MyTalkZone3.0/
├── src/
│   ├── app.js                 # Main server entry point + REST API
│   ├── index.html             # Call page / waiting page / prejoin flow
│   ├── hub.html               # Hub UI for rooms and scheduled meetings
│   ├── admin.html             # Admin UI for policy management
│   ├── ws/
│   │   ├── stream.js          # Socket / signaling handlers
│   │   ├── roomsStore.js      # In-memory live room metadata store
│   │   ├── meetingsStore.js   # Scheduled meeting storage + time gating
│   │   ├── meetings.json      # Persisted scheduled meetings
│   │   ├── loadPolicy.js      # Policy loader/writer
│   │   ├── roomPolicy.js      # Policy helpers
│   │   └── roomPolicy.json    # Master key / allowed creators / thresholds
│   ├── assets/
│   │   ├── js/
│   │   │   ├── rtc.js         # WebRTC, join flow, meeting gate UI
│   │   │   ├── hub.js         # Live room listing/search/join UI
│   │   │   ├── meetings.js    # Scheduled meeting UI / CRUD / rendering
│   │   │   ├── deso-post.js   # DeSo invite/reminder posting flow
│   │   │   ├── deso.js        # DeSo login/session helpers
│   │   │   ├── admin.js       # Admin policy editor logic
│   │   │   ├── names.js       # Participant label helpers
│   │   │   ├── helpers.js     # Shared client helpers
│   │   │   ├── chat-ui.js     # Chat interactions
│   │   │   └── stage.js       # Layout / stage helpers
│   │   ├── css/
│   │   │   └── app.css        # Shared styling
│   │   └── img/               # Static images/icons
├── package.json               # Node.js dependencies
└── README.md                  # Project documentation
```

---

## High-Level Flow

### Live room flow
1. User opens the app.
2. User logs in with a DeSo account.
3. User browses the Hub or opens a room directly.
4. Server validates room creation rights according to policy.
5. Client connects through Socket.IO signaling.
6. Peers negotiate WebRTC connections.
7. Media flows peer-to-peer, with TURN fallback when needed.
8. Video tiles show DeSo-linked participant labels.

### Scheduled meeting flow
1. A whitelisted creator creates a scheduled meeting.
2. Meeting metadata is saved in `meetings.json`.
3. Creator optionally publishes a DeSo invite post.
4. Users can open the meeting link, but entry is blocked until the join window opens.
5. When entry becomes available, the first participant creates the live room.
6. The scheduled meeting disappears from **Upcoming meetings** and the room appears in **Live rooms**.
7. Ten minutes before start time, the creator can publish a DeSo reminder post.

---

## Data Storage

### Server
- `roomPolicy.json` — stores the master key, allowed creators, and audio-only threshold
- `roomsStore.js` — keeps in-memory active room metadata
- `meetings.json` — stores scheduled meetings persistently

### Browser
- `localStorage["deso_user_key"]` — DeSo public key
- `sessionStorage["username"]` — DeSo username for the current MyTalkZone browser session
- additional DeSo identity/session payloads may be stored by the login / post flow

---

## Main Routes

### Pages
- `/` — Hub page
- `/call` — Call page / prejoin / scheduled waiting page
- `/admin` — Admin page

### API
- `/api/policy` — Get/update room policy
- `/api/rooms` — Live room listing for the hub
- `/api/can-create` — Lightweight permission check
- `/api/meetings` — List/create scheduled meetings
- `/api/meetings/:id` — Update/delete scheduled meetings
- `/api/meetings/access/:roomId` — Scheduled access check for join gating
- `/api/meetings/:id/invite-posted` — Mark invite as posted
- `/api/meetings/:id/reminder-posted` — Mark reminder as posted

---

## Quick Start

```bash
npm install
node src/app.js
```

Open in browser:

```text
/        -> hub
/call    -> call page
/admin   -> admin page
```

---

## DeSo Identity Notes

MyTalkZone uses DeSo identity data in two different ways:

1. **Public key** is stored in `localStorage`
2. **Username** is stored in `sessionStorage`

This means:
- if you enter a room from inside MyTalkZone after logging in, the app usually shows your `@username`
- if you open a direct `/call?...` link in a fresh browser tab or session where MyTalkZone has no username in `sessionStorage`, the app may fall back to your DeSo public key and display a shortened wallet address instead

This is expected with the current architecture and can be improved later by auto-resolving usernames on the call page when only the public key is known.

---

## Deployment Notes

Typical production setup used in this project:
- Ubuntu / DigitalOcean droplet
- Node.js
- PM2
- Nginx reverse proxy
- HTTPS via Certbot / Let’s Encrypt
- TURN server for WebRTC fallback

If deploying by ZIP or copy script, make sure the app lands with this structure:

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

## Current Behaviour Summary

- Room creation is restricted to whitelisted DeSo users.
- Scheduled meeting creation is also restricted to whitelisted users.
- Scheduled meeting links can be opened early, but actual entry is blocked until the join window opens.
- Upcoming meetings disappear once the live room becomes active.
- Invite and reminder posts require explicit user approval through the DeSo flow.
- Participant labels are best when MyTalkZone already knows the user’s DeSo username in the current session.

---

## License / Usage

Add your preferred license here if the project will be published publicly on GitHub.
