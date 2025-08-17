\# Security Policy



\## Supported Versions

This project is a fork of Amir Sanni’s Video-Call-App-NodeJS and is maintained on a best-effort basis.

We aim to fix critical security issues in the current main branch.



\## Reporting a Vulnerability

Please email security reports privately to nagy.stevo@mail.com

\- Do not open public GitHub issues for vulnerabilities.

\- Include steps to reproduce, affected files/paths, and any logs.

\- If possible, share a minimal PoC. We appreciate clear, actionable reports.



\## Response \& Disclosure

\- We’ll investigate and aim to provide a fix or mitigation timeline.

\- We’ll publish details after a fix/patch is available.



\## Scope

\- This repository’s source code (server, WebRTC client, admin UI).

\- Configuration for room creation policy (e.g., `roomPolicy.json` and related code).



Out of scope:

\- Third-party dependencies’ own vulnerabilities (please report upstream),

&nbsp; though we may update/patch deps as mitigations.



\## Best Practices in This Fork

\- Room creation restricted to a whitelist (`roomPolicy.json`).

\- Admin API limited to master key.

\- WebRTC uses encrypted media (DTLS/SRTP).



Recommended ops for deployers:

\- Run behind HTTPS.

\- Keep dependencies updated.

\- Sanitize user content in chat/UI.

\- Restrict server access to the admin route.



