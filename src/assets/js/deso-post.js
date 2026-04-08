(function () {
  const APP_NAME = 'MyTalkZone';
  const NODE_URI = 'https://node.deso.org';
  const IDENTITY_ORIGIN = 'https://identity.deso.org';
  const APPROVE_URL = `${IDENTITY_ORIGIN}/approve`;
  const MIN_FEE_RATE_NANOS_PER_KB = 1000;

  function getExpectedPubKey() {
    try {
      return String(localStorage.getItem('deso_user_key') || '').trim();
    } catch {
      return '';
    }
  }

  function formatDateTimeInZone(iso, timeZone, locale = 'en-GB') {
    try {
      const d = new Date(iso);
      return new Intl.DateTimeFormat(locale, {
        timeZone: timeZone || 'Europe/Zagreb',
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false,
      }).format(d);
    } catch {
      return String(iso || '');
    }
  }

  function formatLocalDateTimePair(iso, timeZone) {
    const local = formatDateTimeInZone(iso, timeZone || 'Europe/Zagreb', 'en-GB');
    const utc = formatDateTimeInZone(iso, 'UTC', 'en-GB');
    return `${local} Europe/Zagreb / ${utc} UTC`;
  }

  function meetingJoinLink(meeting) {
    const url = new URL(window.location.origin + '/call');
    url.searchParams.set('room', meeting.roomId);
    url.searchParams.set('title', meeting.title || meeting.roomId);
    url.searchParams.set('meeting', meeting.id);
    return url.toString();
  }

  function getMentionText(meeting) {
    return Array.isArray(meeting?.participantMentions)
      ? meeting.participantMentions.filter(Boolean).map(v => v.startsWith('@') ? v : `@${v}`).join(' ')
      : '';
  }

  function buildInviteText(meeting) {
    const mentions = getMentionText(meeting);
    const when = formatLocalDateTimePair(meeting?.scheduledFor, meeting?.timezone || 'Europe/Zagreb');
    const lines = [
      `📅 Scheduled meeting: ${meeting?.title || meeting?.roomId || 'Meeting'}`,
      '',
      `🕒 Time: ${when}`,
      `⏱ Duration: ${meeting?.durationMin || 60} min`,
      '',
      '🔗 Join link:',
      meetingJoinLink(meeting),
    ];
    if (meeting?.description) lines.push('', meeting.description);
    if (mentions) lines.push('', 'Participants:', mentions);
    lines.push('', `Hosted on ${APP_NAME}`);
    return lines.join('\n');
  }

  function buildReminderText(meeting) {
    const mentions = getMentionText(meeting);
    const when = formatLocalDateTimePair(meeting?.scheduledFor, meeting?.timezone || 'Europe/Zagreb');
    const lines = [
      `⏰ Reminder: ${meeting?.title || meeting?.roomId || 'Meeting'} starts in 10 minutes.`,
      '',
      `🕒 Time: ${when}`,
      `⏱ Duration: ${meeting?.durationMin || 60} min`,
      '',
      '🔗 Join link:',
      meetingJoinLink(meeting),
    ];
    if (meeting?.description) lines.push('', meeting.description);
    if (mentions) lines.push('', mentions);
    lines.push('', `Hosted on ${APP_NAME}`);
    return lines.join('\n');
  }

  async function copyText(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    return true;
  }

  async function copyInviteText(meeting) {
    const text = buildInviteText(meeting);
    await copyText(text);
    return text;
  }

  async function copyReminderText(meeting) {
    const text = buildReminderText(meeting);
    await copyText(text);
    return text;
  }

  function getPopupFeatures() {
    const w = 800;
    const h = 730;
    const left = Math.max(0, Math.round((window.outerWidth - w) / 2 + window.screenX));
    const top = Math.max(0, Math.round((window.outerHeight - h) / 2 + window.screenY));
    return `popup=yes,width=${w},height=${h},left=${left},top=${top}`;
  }

  function normalizeHash(obj) {
    if (!obj || typeof obj !== 'object') return '';
    return String(
      obj.PostHashHex ||
      obj.TxnHashHex ||
      obj.TransactionIDBase58Check ||
      obj.Transaction?.TxnMeta?.PostHashHex ||
      obj.SubmittedTransactionResponse?.PostEntryResponse?.PostHashHex ||
      obj.SubmittedTransactionResponse?.TxnHashHex ||
      obj.SubmitTransactionResponse?.PostEntryResponse?.PostHashHex ||
      obj.SubmitTransactionResponse?.TxnHashHex ||
      ''
    ).trim();
  }

  async function constructSubmitPostTx(publicKey, body) {
    const res = await fetch(`${NODE_URI}/api/v0/submit-post`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        UpdaterPublicKeyBase58Check: publicKey,
        BodyObj: {
          Body: body,
          ImageURLs: [],
          VideoURLs: [],
        },
        MinFeeRateNanosPerKB: MIN_FEE_RATE_NANOS_PER_KB,
        InTutorial: false,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || json.Message || 'Failed to construct post transaction.');
    const txHex = String(json.TransactionHex || '').trim();
    if (!txHex) throw new Error('Node did not return TransactionHex for submit-post.');
    return { txHex, raw: json };
  }

  function openApprovePopup(txHex) {
    return new Promise((resolve, reject) => {
      const url = `${APPROVE_URL}?tx=${encodeURIComponent(txHex)}`;
      const popup = window.open(url, 'DeSoApprove', getPopupFeatures());
      if (!popup) {
        reject(new Error('Approve popup was blocked by the browser.'));
        return;
      }

      window.__desoApprovePopup = popup;
      let finished = false;

      const cleanup = () => {
        finished = true;
        try { window.removeEventListener('message', onMessage); } catch {}
        try { clearInterval(closePoll); } catch {}
        try { if (!popup.closed) popup.close(); } catch {}
        if (window.__desoApprovePopup === popup) {
          try { delete window.__desoApprovePopup; } catch {}
        }
      };

      const closePoll = setInterval(() => {
        if (finished) return;
        if (popup.closed) {
          cleanup();
          reject(new Error('Approve window was closed before the transaction was signed.'));
        }
      }, 400);

      const onMessage = (event) => {
        if (event.origin !== IDENTITY_ORIGIN) return;
        const data = event.data || {};
        if (data.service !== 'identity') return;

        if (data.method === 'initialize') {
          popup.postMessage({ id: data.id, service: data.service, payload: {} }, IDENTITY_ORIGIN);
          return;
        }

        if (data.method === 'login' && data.payload?.signedTransactionHex) {
          const signedTransactionHex = String(data.payload.signedTransactionHex || '').trim();
          const payload = data.payload || {};
          cleanup();
          resolve({ signedTransactionHex, payload });
        }
      };

      window.addEventListener('message', onMessage);
    });
  }

  async function submitSignedTransaction(signedTransactionHex) {
    const res = await fetch(`${NODE_URI}/api/v0/submit-transaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ TransactionHex: signedTransactionHex }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || json.Message || 'Failed to submit signed transaction.');
    return json;
  }

  async function publishTextToDeSo(text, { kind = 'Post' } = {}) {
    const expectedPubKey = getExpectedPubKey();

    if (!expectedPubKey) {
      await copyText(text);
      return {
        ok: false,
        copied: true,
        text,
        reason: `Please log in with DeSo first. ${kind} text was copied.`,
      };
    }

    try {
      const { txHex } = await constructSubmitPostTx(expectedPubKey, text);
      const { signedTransactionHex, payload } = await openApprovePopup(txHex);
      const submitResponse = await submitSignedTransaction(signedTransactionHex);
      const postHashHex = normalizeHash(submitResponse) || normalizeHash(payload);
      return {
        ok: true,
        text,
        signedTransactionHex,
        submitResponse,
        postHashHex,
        reason: postHashHex ? `${kind} published to DeSo.` : `${kind} submitted to DeSo.`,
      };
    } catch (err) {
      console.error(`DeSo publish ${kind} failed:`, err);
      try { await copyText(text); } catch {}
      const msg = err?.message ? ` ${err.message}` : '';
      return {
        ok: false,
        copied: true,
        text,
        errorMessage: err?.message || `DeSo ${kind} failed.`,
        reason: `Automatic DeSo posting did not complete.${msg} ${kind} text was copied so you can paste it manually.`,
      };
    }
  }

  async function publishInvite(meeting) {
    return publishTextToDeSo(buildInviteText(meeting), { kind: 'Invite' });
  }

  async function publishReminder(meeting) {
    return publishTextToDeSo(buildReminderText(meeting), { kind: 'Reminder' });
  }

  window.MyTalkZoneDeSoPost = {
    buildInviteText,
    buildReminderText,
    copyInviteText,
    copyReminderText,
    publishInvite,
    publishReminder,
    meetingJoinLink,
    preload: async () => true,
  };
})();
