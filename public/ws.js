(() => {
  const path = document.body.getAttribute('data-gate');
  if (!path) return;

  let socket = null;
  let idTag = '?';
  let ui = null;
  const IMG_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg']);
  const VID_EXT = new Set(['.mp4', '.webm', '.ogg', '.ogv', '.mov', '.m4v']);
  const URL_RE  = /\bhttps?:\/\/[^\s<>"']+/gi;

  function extOf(u) {
    try {
      const { pathname } = new URL(u);
      const m = pathname.toLowerCase().match(/\.[a-z0-9]{2,5}$/);
      return m ? m[0] : '';
    } catch {
      return '';
    }
  }
  function mediaKind(u) {
    const e = extOf(u);
    if (IMG_EXT.has(e)) return 'image';
    if (VID_EXT.has(e)) return 'video';
    return '';
  }
  function uniqueId(prefix = 'media') {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`;
  }

  function ensureUI() {
    if (ui) return ui;
    const main = document.querySelector('main > section') || document.body;
    const media = document.createElement('div');
    media.id = 'media';
    media.className = 'card';
    main.appendChild(media);

    const wrap = document.createElement('div');
    wrap.id = 'messaging';

    const messagingContent = document.createElement('div');
    messagingContent.id = 'messagingContent';
    wrap.appendChild(messagingContent);

    const msg = document.createElement('input');
    msg.id = 'msg';
    msg.placeholder = 'Write your message: 350 chars max';
    msg.maxLength = 350;
    wrap.appendChild(msg);

    const ttl = document.createElement('span');
    ttl.id = 'ttl';
    ttl.textContent = 'Messages are automatically deleted after 1 week.';
    wrap.appendChild(ttl);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Send';
    btn.addEventListener('click', () => {
      const text = msg.value.trim();
      if (!text || text.length > 350) return;
      socket.emit('whisper', text);
      appendMessage(idTag, text);
      msg.value = '';
      msg.focus();
    });
    msg.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') btn.click();
    });
    wrap.appendChild(btn);
    document.body.appendChild(wrap);
    ui = { media, wrap, messagingContent, msg, btn };
    return ui;
  }

  function renderMedia(url, kind) {
    const { media } = ensureUI();
    const holder = document.createElement('figure');
    const anchorId = uniqueId('media');
    holder.id = anchorId;
    holder.style.margin = 0;

    if (kind === 'image') {
      const img = new Image();
      img.src = url;
      img.alt = 'shared image';
      img.loading = 'lazy';
      img.style.maxWidth = '100%';
      img.style.height = 'auto';
      holder.appendChild(img);
    } else if (kind === 'video') {
      const video = document.createElement('video');
      video.src = url;
      video.controls = true;
      video.preload = 'metadata';
      video.style.maxWidth = '100%';
      holder.appendChild(video);
    }

    media.appendChild(holder);
    return anchorId;
  }

  function appendMessage(from, text) {
    const { messagingContent } = ensureUI();
    const p = document.createElement('p');

    if (from) {
      const who = document.createElement('strong');
      who.textContent = `${from}`;
      p.appendChild(who);
    }

    let usedMedia = false;
    let last = 0;
    const matches = [...(text.matchAll(URL_RE) || [])];

    if (matches.length === 0) {
      p.appendChild(document.createTextNode(text));
    } else {
      for (const m of matches) {
        const start = m.index;
        const rawUrl = m[0];
        if (start > last) p.appendChild(document.createTextNode(text.slice(last, start)));

        const url = rawUrl.replace(/[),.;!?]+$/, '');
        const kind = mediaKind(url);

        if (!usedMedia && (kind === 'image' || kind === 'video')) {
          const anchorId = renderMedia(url, kind);
          const emoji = kind === 'image' ? '🖼️' : '🎞️';

          const a = document.createElement('a');
          a.href = `#${anchorId}`;
          a.textContent = emoji;
          a.title = url;

          a.addEventListener('click', (e) => {
            const el = document.getElementById(anchorId);
            if (el) {
              e.preventDefault();
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              history.replaceState(null, '', `#${anchorId}`);
            }
          });

          p.appendChild(a);
          usedMedia = true;
        } else {
          const a = document.createElement('a');
          a.href = url;
          a.textContent = url;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          p.appendChild(a);
        }

        last = start + rawUrl.length;
      }
      if (last < text.length) {
        p.appendChild(document.createTextNode(text.slice(last)));
      }
    }

    messagingContent.appendChild(p);
    messagingContent.scrollTop = messagingContent.scrollHeight;
  }

  socket = io('/gatews', {
    path: '/ws',
    auth: { keyPath: path },
    transports: ['websocket']
  });

  socket.on('connect', () => {
    document.body.setAttribute('data-gate', path);
    idTag = (socket.id || '').slice(-4);
    ensureUI();
    appendMessage('', 'Chat loaded successfully.');
  });

  socket.on('whisper', (ev) => {
    appendMessage(ev?.from || '', ev?.msg || '');
  });

  socket.on('history', (list = []) => {
    ensureUI();
    for (const m of list) appendMessage(m.from || '', m.msg || '');
  });

  socket.on('disconnect', () => {
    appendMessage('', '-- DISCONNECTED --');
  });
})();