MyTalkZone v1.5
===============

Credits:
--------
Developed by: Stevo Nagy & ChatGPT (OpenAI)
Base Version: MyTalkZone v1.4

Description:
------------
MyTalkZone is a browser-based real-time video chat platform built with Node.js, Socket.IO, and WebRTC.
It enables users to create and join virtual rooms for high-quality video calls, audio communication,
and live chat. The system supports TURN/STUN server integration to ensure reliable connectivity
across different networks, including NAT and firewalls.

Version History:
----------------

Version 1.5 (Dynamic Video Scaling)
-----------------------------------
This release introduces a dynamic 'Scale Policy' that automatically adjusts video quality based on the number of participants in a room, improving performance and reducing bandwidth usage without compromising user experience.

New Features:
- Adaptive video resolution:
  • 1–4 participants: 720p @ 30fps, ~1800 kbps
  • 5–7 participants: 540p @ 24fps, ~1200 kbps
  • 8+ participants: 360p @ 20fps, ~600 kbps
- Optional audio-only mode when participants exceed a configurable threshold (default: 8).
- Bitrate limits applied per sender to avoid network congestion.
- Smooth constraint changes via applyConstraints without requiring new media capture.

Configuration:
- Thresholds and bitrates can be adjusted in SCALE_PROFILES within src/assets/js/rtc.js.
- audioOnlyAbove parameter controls when video is disabled in favor of audio-only mode.


Version 1.4 (Stable Release)
----------------------------
This version delivered a stable, production-ready platform for real-time video conferencing, audio communication, and in-room chat. Key features included:
- Creation and joining of unlimited rooms.
- Reliable media delivery using integrated TURN/STUN server support.
- Full compatibility with modern browsers supporting WebRTC.
- Optimized signaling via Socket.IO for fast connection setup.
- Clean and responsive user interface for desktop and mobile.

Technical Highlights:
- Server built with Node.js and Express.js.
- Real-time signaling handled in src/ws modules.
- Client-side logic in src/assets/js/rtc.js and supporting scripts.
- Modular architecture allowing future upgrades without breaking existing features.


Project Layout:
---------------
MyTalkZone.1.5/
├── src/
│   ├── app.js              # Main server entry point
│   ├── ws/                 # WebSocket / signaling handlers
│   ├── assets/
│   │   ├── js/rtc.js       # WebRTC logic (updated in v1.5)
│   │   ├── js/...          # Client-side scripts
│   │   ├── css/            # Stylesheets
│   │   └── img/            # Images and icons
│   └── views/              # HTML/EJS templates
├── package.json            # Node.js dependencies
├── README.txt              # Project documentation
└── ...

High-Level Flow:
----------------
1. User opens the application in their browser.
2. User creates a new room or joins an existing one.
3. Client connects to the Node.js server via Socket.IO.
4. Signaling messages are exchanged to establish WebRTC peer connections.
5. Media streams (video/audio) are sent peer-to-peer, with TURN fallback for NAT/firewall traversal.
6. In v1.5, participant count is monitored to adjust video resolution and bitrate automatically.
7. If participant count exceeds the configured audioOnlyAbove threshold, video is disabled and only audio is transmitted.

Data storage:
----------------
- Server:
  - roomPolicy.json: stores master key & allowed creators.
  - roomsStore.js: keeps runtime record of active rooms.
- Browser:
  - localStorage["deso_user_key"]: user's public key.
  - sessionStorage["username"]: display name.

Endpoints & pages
--------------------
- /: Main app UI.
- /hub: Hub interface for room browsing/join 
- /admin: Admin interface (master only).
- /api/policy:
  - GET: Returns policy if caller is master.
  - POST: Updates allowed creators; logs changes

Quick start
------------------
npm install
node src/app.js

# Visit:
# /      -> login, join/create rooms
# /hub   -> browse/join active rooms
# /admin -> manage allowed creators (master only)
