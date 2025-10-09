MyTalkZone v2.0
===============

Credits:
--------
Developed by: Stevo Nagy & ChatGPT (OpenAI)
Base Version: MyTalkZone v1.4

Description:
------------
MyTalkZone is a browser-based decentralized real-time video meeting platform built with Node.js, Socket.IO, and WebRTC.
It enables users to create and join virtual rooms for high-quality video calls, audio communication, and live chat.
From version 2.0 onward, the platform is integrated with the DeSo blockchain for authentication, usernames, and profile avatars.

It supports TURN/STUN server integration to ensure reliable connectivity across different networks, including NAT and firewalls.

------------------------------------------------------------
Version History
------------------------------------------------------------

Version 2.0 (DeSo Integration & UI Enhancements)
------------------------------------------------
This release introduces blockchain-linked identity, avatars, and improved user experience across both Hub and call views.

New Features:
-------------
- DeSo Username Display:
  Public keys are replaced with the user’s actual DeSo username throughout the app (Hub and room view).
- User Avatars:
  Each room card in the Hub now displays the creator’s DeSo profile picture (with automatic fallback).
- Room Title Display:
  When a room is created or joined, the top bar now shows the room title instead of its internal ID.
- Stable Signaling & Creation:
  Room creation and join flows are fully synchronized between frontend and backend,
  ensuring the room is visible to all users immediately after creation.
- Improved UI Elements:
  Minor adjustments to spacing, labels, and icons for a cleaner experience.
- No dependency on external profile fetches during room creation:
  All DeSo data (username, avatar) is passed directly from the client session.

Technical Overview (v2.0 Highlights)
-----------------------------------
Server:
- Updated stream.js to accept createdByName from the client when a room is created.
- Updated roomsStore.js to store and broadcast createdByName.

Client:
- Updated rtc.js to send both title and createdByName when creating a room.
- Updated hub.js to show avatars next to usernames.
- Room title replaces numeric ID in the header.

API endpoints remain unchanged — all upgrades are backward-compatible.

------------------------------------------------------------
Version 1.5 (Dynamic Video Scaling)
------------------------------------------------------------
This release introduced a dynamic 'Scale Policy' that automatically adjusts video quality based on the number of participants in a room,
improving performance and reducing bandwidth usage without compromising user experience.

New Features:
-------------
- Adaptive video resolution:
  • 1–4 participants: 720p @ 30fps, ~1800 kbps
  • 5–7 participants: 540p @ 24fps, ~1200 kbps
  • 8+ participants: 360p @ 20fps, ~600 kbps
- Optional audio-only mode when participants exceed a configurable threshold (default: 8).
- Bitrate limits applied per sender to avoid network congestion.
- Smooth constraint changes via applyConstraints without requiring new media capture.

Configuration:
--------------
- Thresholds and bitrates can be adjusted in SCALE_PROFILES within src/assets/js/rtc.js.
- audioOnlyAbove parameter controls when video is disabled in favor of audio-only mode.

------------------------------------------------------------
Version 1.4 (Stable Release)
------------------------------------------------------------
This version delivered a stable, production-ready platform for real-time video conferencing, audio communication, and in-room chat.

Key features included:
----------------------
- Creation and joining of unlimited rooms.
- Reliable media delivery using integrated TURN/STUN server support.
- Full compatibility with modern browsers supporting WebRTC.
- Optimized signaling via Socket.IO for fast connection setup.
- Clean and responsive user interface for desktop and mobile.

Technical Highlights:
---------------------
- Server built with Node.js and Express.js.
- Real-time signaling handled in src/ws modules.
- Client-side logic in src/assets/js/rtc.js and supporting scripts.
- Modular architecture allowing future upgrades without breaking existing features.

------------------------------------------------------------
Project Layout
------------------------------------------------------------
MyTalkZone.2.0/
├── src/
│   ├── app.js              # Main server entry point
│   ├── ws/                 # WebSocket / signaling handlers
│   │   ├── stream.js       # Handles room events and signaling
│   │   └── roomsStore.js   # In-memory storage of active rooms and metadata
│   ├── assets/
│   │   ├── js/rtc.js       # WebRTC logic and connection handling
│   │   ├── js/hub.js       # Hub UI with avatars, usernames, and room listing
│   │   ├── css/            # Stylesheets for UI
│   │   └── img/            # Images and icons
│   └── views/              # HTML/EJS templates
├── package.json            # Node.js dependencies
├── README.txt              # Project documentation
└── ...

------------------------------------------------------------
High-Level Flow
------------------------------------------------------------
1. User opens the application in their browser.
2. User logs in with their DeSo account (v2.0).
3. User creates a new room or joins an existing one.
4. Client connects to the Node.js server via Socket.IO.
5. Signaling messages are exchanged to establish WebRTC peer connections.
6. Media streams (video/audio) are sent peer-to-peer, with TURN fallback for NAT/firewall traversal.
7. In v1.5, participant count is monitored to adjust video resolution and bitrate automatically.
8. In v2.0, room metadata includes creator’s username and avatar displayed in the Hub.

------------------------------------------------------------
Data Storage
------------------------------------------------------------
Server:
--------
- roomPolicy.json: stores master key & allowed creators.
- roomsStore.js: keeps runtime record of active rooms (with createdBy & createdByName).

Browser:
--------
- localStorage["deso_user_key"]: user's public key.
- sessionStorage["username"]: user's DeSo username (v2.0).

------------------------------------------------------------
Endpoints & Pages
------------------------------------------------------------
- /: Main app UI.
- /hub: Hub interface for browsing and joining rooms.
- /admin: Admin interface (master only).
- /api/policy:
  - GET: Returns policy if caller is master.
  - POST: Updates allowed creators; logs changes.

------------------------------------------------------------
Quick Start
------------------------------------------------------------
npm install
node src/app.js

# Visit:
# /        -> login, join/create rooms
# /hub     -> browse/join active rooms
# /admin   -> manage allowed creators (master only)
