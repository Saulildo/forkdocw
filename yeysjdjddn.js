// Khanware.js - Advanced Chat Overlay System (Bookmarklet-hardened)
(function () {
  'use strict';

  // ========= USER SETTINGS (Edit these two lines) =========
  const OPENAI_API_KEY = ''; // Put your OpenAI API key here (optional; you can still paste it in the UI)
  const SYSTEM_PROMPT = 'You are a helpful, concise assistant. Keep answers clear and useful.';
  // ========================================================

  // Tiny toast for bootstrap/debug (works even if overlay fails)
  function kwToast(msg, ms = 3500) {
    try {
      let el = document.getElementById('khanware-toast');
      if (!el) {
        el = document.createElement('div');
        el.id = 'khanware-toast';
        el.style.cssText = [
          'position:fixed',
          'z-index:2147483647',
          'left:16px',
          'bottom:16px',
          'max-width:75vw',
          'background:rgba(20,20,24,0.95)',
          'color:#fff',
          'padding:10px 12px',
          'border-radius:10px',
          'font:13px/1.4 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Inter,Helvetica,Arial',
          'box-shadow:0 8px 28px rgba(0,0,0,0.35)',
          'white-space:pre-wrap'
        ].join(';');
        document.body.appendChild(el);
      }
      el.textContent = String(msg);
      el.style.display = 'block';
      clearTimeout(el.__kwHideTimer);
      el.__kwHideTimer = setTimeout(() => {
        if (el && el.parentNode) el.style.display = 'none';
      }, ms);
    } catch (_) {
      // ignore toast errors
    }
  }

  // Prevent double-loading
  if (window.__khanware_loaded) {
    kwToast('Khanware already loaded. Tap the chat bubble or press G to toggle.');
    return;
  }

  // Global error traps to surface issues
  const onWinError = (e) => {
    const msg = e?.error?.message || e?.message || 'Unknown error';
    console.error('[Khanware] Uncaught error:', e?.error || e);
    kwToast('Khanware error: ' + msg);
  };
  const onWinRejection = (e) => {
    const reason = e?.reason?.message || e?.reason || 'Unknown promise rejection';
    console.error('[Khanware] Unhandled rejection:', e?.reason || e);
    kwToast('Khanware: ' + reason);
  };
  window.addEventListener('error', onWinError);
  window.addEventListener('unhandledrejection', onWinRejection);

  try {
    const CONFIG = {
      namespace: 'khanware',
      dbName: 'KhanwareDB',
      dbVersion: 1,
      storeName: 'chats',
      defaultModel: 'gpt-5',
      models: {
        'gpt-5': { name: 'GPT-5' },
        'gpt-5-mini': { name: 'GPT-5 Mini' }
      },
      reasoningEfforts: ['low', 'medium', 'high']
    };

    const isAndroid = () => /android/i.test(navigator.userAgent);

    // Safe localStorage helpers (avoid crashing on strict environments)
    function lsGet(key, fallback) {
      try {
        const s = localStorage.getItem(key);
        return s ? JSON.parse(s) : fallback;
      } catch (_) {
        return fallback;
      }
    }
    function lsSet(key, val) {
      try {
        localStorage.setItem(key, JSON.stringify(val));
      } catch (_) {
        // ignore
      }
    }

    class KhanwareChat {
      constructor() {
        this.state = this.loadState();
        if (!this.state.apiKey && OPENAI_API_KEY) {
          this.state.apiKey = OPENAI_API_KEY;
        }
        this.currentChat = [];
        this.attachedImages = [];
        this.db = null;
        this.abortController = null;
        this.isDragging = false;
        this.isResizing = false;
        this.dragOffset = { x: 0, y: 0 };
        this.touchStartPos = { x: 0, y: 0 };
        this.mobileToggleBtn = null;
        this.systemPromptInjected = false;
        this._handlers = {}; // store bound listeners for clean removal

        this.init().catch((err) => {
          console.error('[Khanware] init() failed:', err);
          kwToast('Khanware failed to initialize: ' + (err?.message || err));
        });
      }

      loadState() {
        const saved = lsGet(`${CONFIG.namespace}_state`, null);
        if (saved) return saved;
        // First run: auto-open to avoid "nothing happened" confusion
        return {
          visible: true,
          theme: 'dark',
          position: { x: Math.max(20, window.innerWidth - 440), y: 20 },
          size: { width: 420, height: 640 },
          apiKey: '',
          model: CONFIG.defaultModel,
          effort: 'medium',
          chatHistory: []
        };
      }

      saveState() {
        lsSet(`${CONFIG.namespace}_state`, this.state);
      }

      async init() {
        await this.initDB().catch((e) => {
          console.warn('[Khanware] IndexedDB disabled, continuing without history:', e);
          this.db = null;
          kwToast('Khanware: DB unavailable, history disabled.');
        });
        this.createStyles();
        this.createOverlay();
        this.attachEventListeners();
        await this.loadChatHistory().catch((e) => {
          console.warn('[Khanware] loadChatHistory failed:', e);
        });
        this.createMobileToggleButton();

        if (this.state.visible) this.show();
        window.__khanware_loaded = true;
        kwToast('Khanware loaded. Tap 💬 or press G to toggle.');
        console.log('Khanware loaded. Press G to toggle.');
      }

      async initDB() {
        if (!('indexedDB' in window)) throw new Error('IndexedDB not supported');
        return new Promise((resolve, reject) => {
          const request = indexedDB.open(CONFIG.dbName, CONFIG.dbVersion);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            this.db = request.result;
            resolve();
          };
          request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(CONFIG.storeName)) {
              const store = db.createObjectStore(CONFIG.storeName, { keyPath: 'id', autoIncrement: true });
              store.createIndex('timestamp', 'timestamp', { unique: false });
            }
          };
        });
      }

      createStyles() {
        const style = document.createElement('style');
        style.id = `${CONFIG.namespace}-styles`;
        style.textContent = `
          .${CONFIG.namespace}-overlay {
            position: fixed; z-index: 2147483647;
            font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Inter, Helvetica, Arial, Apple Color Emoji, Segoe UI Emoji;
            box-shadow: 0 10px 40px rgba(0,0,0,0.25);
            border-radius: 16px; overflow: hidden; display: none; touch-action: none;
            backdrop-filter: blur(6px); border: 1px solid var(--border-color);
          }
          .${CONFIG.namespace}-overlay.visible { display: flex; }
          .${CONFIG.namespace}-container { width: 100%; height: 100%; display: flex; flex-direction: column; }

          .${CONFIG.namespace}-header {
            padding: 12px 14px; display: flex; align-items: center; justify-content: space-between;
            cursor: move; user-select: none; border-bottom: 1px solid var(--border-color);
            background: linear-gradient(180deg, var(--header-bg) 0%, var(--header-bg-2) 100%);
            -webkit-touch-callout: none;
          }
          .${CONFIG.namespace}-title { display: flex; align-items: center; gap: 10px; }
          .${CONFIG.namespace}-title-text { font-weight: 700; font-size: 14px; color: var(--text-primary); letter-spacing: 0.2px; }
          .${CONFIG.namespace}-status-pill {
            font-size: 11px; color: var(--text-secondary); background: var(--pill-bg);
            border: 1px solid var(--border-color); padding: 4px 8px; border-radius: 999px;
          }

          .${CONFIG.namespace}-controls { display: flex; gap: 6px; }
          .${CONFIG.namespace}-btn {
            padding: 6px 10px; border: 1px solid var(--border-color); border-radius: 8px; cursor: pointer;
            font-size: 12px; transition: all 0.15s ease; background: var(--btn-bg); color: var(--text-primary);
          }
          .${CONFIG.namespace}-btn:hover { background: var(--btn-hover); transform: translateY(-1px); }
          .${CONFIG.namespace}-btn:active { transform: translateY(0); }
          .${CONFIG.namespace}-icon-btn { width: 30px; height: 30px; padding: 0; display: flex; align-items: center; justify-content: center; }

          .${CONFIG.namespace}-body { flex: 1; display: flex; background: var(--bg-primary); overflow: hidden; }
          .${CONFIG.namespace}-sidebar {
            width: 220px; border-right: 1px solid var(--border-color); display: flex; flex-direction: column; background: var(--sidebar-bg);
          }
          .${CONFIG.namespace}-settings { padding: 12px; border-bottom: 1px solid var(--border-color); background: var(--settings-bg); display: grid; gap: 10px; }
          .${CONFIG.namespace}-input-group { display: grid; gap: 6px; }
          .${CONFIG.namespace}-label { font-size: 11px; color: var(--text-secondary); }
          .${CONFIG.namespace}-input, .${CONFIG.namespace}-select {
            width: 100%; padding: 8px 10px; border: 1px solid var(--border-color); border-radius: 8px;
            font-size: 12px; background: var(--input-bg); color: var(--text-primary); outline: none;
          }

          .${CONFIG.namespace}-history { flex: 1; overflow-y: auto; padding: 8px; display: grid; gap: 6px; }
          .${CONFIG.namespace}-history-item {
            padding: 8px; border-radius: 8px; cursor: pointer; font-size: 12px; background: var(--history-item-bg); color: var(--text-secondary);
            border: 1px solid var(--border-color); transition: all 0.15s ease;
          }
          .${CONFIG.namespace}-history-item:hover { background: var(--history-item-hover); color: var(--text-primary); transform: translateY(-1px); }

          .${CONFIG.namespace}-main { flex: 1; display: flex; flex-direction: column; }
          .${CONFIG.namespace}-messages { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; background: var(--chat-bg); }
          .${CONFIG.namespace}-message { display: flex; gap: 10px; animation: kwFadeIn 0.25s ease; }
          @keyframes kwFadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }

          .${CONFIG.namespace}-avatar { width: 28px; height: 28px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; flex-shrink: 0; color: white; }
          .${CONFIG.namespace}-avatar.user { background: var(--user-avatar); }
          .${CONFIG.namespace}-avatar.assistant { background: var(--assistant-avatar); }
          .${CONFIG.namespace}-avatar.system { background: var(--system-avatar); }

          .${CONFIG.namespace}-message-content {
            flex: 1; padding: 10px 12px; border-radius: 12px; background: var(--message-bg); color: var(--text-primary);
            font-size: 14px; line-height: 1.5; word-wrap: break-word; border: 1px solid var(--border-color);
          }
          .${CONFIG.namespace}-message.user .${CONFIG.namespace}-message-content { background: var(--message-user-bg); }
          .${CONFIG.namespace}-message-content pre { background: var(--code-bg); padding: 8px; border-radius: 8px; overflow-x: auto; border: 1px solid var(--border-color); }
          .${CONFIG.namespace}-message-content code { background: var(--code-bg); padding: 2px 4px; border-radius: 4px; font-size: 13px; }
          .${CONFIG.namespace}-message-actions { display: flex; gap: 6px; margin-top: 8px; }

          .${CONFIG.namespace}-input-area { padding: 12px; border-top: 1px solid var(--border-color); background: var(--input-area-bg); display: grid; gap: 10px; }
          .${CONFIG.namespace}-attached-images { display: flex; gap: 8px; flex-wrap: wrap; }
          .${CONFIG.namespace}-attached-image { position: relative; width: 64px; height: 64px; border-radius: 8px; overflow: hidden; border: 1px solid var(--border-color); }
          .${CONFIG.namespace}-attached-image img { width: 100%; height: 100%; object-fit: cover; }
          .${CONFIG.namespace}-remove-image {
            position: absolute; top: 4px; right: 4px; width: 22px; height: 22px; background: rgba(0,0,0,0.75); color: white; border: none; border-radius: 50%;
            cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 12px;
          }
          .${CONFIG.namespace}-textarea {
            width: 100%; min-height: 64px; max-height: 160px; padding: 10px 12px; border: 1px solid var(--border-color);
            border-radius: 10px; resize: vertical; font-size: 14px; font-family: inherit; background: var(--input-bg); color: var(--text-primary); outline: none;
          }
          .${CONFIG.namespace}-input-controls { display: flex; justify-content: space-between; align-items: center; }
          .${CONFIG.namespace}-send-btn { font-weight: 600; }

          .${CONFIG.namespace}-resize-handle {
            position: absolute; bottom: 0; right: 0; width: 20px; height: 20px; cursor: nwse-resize;
            background: linear-gradient(135deg, transparent 50%, var(--border-color) 50%);
          }
          .${CONFIG.namespace}-loading {
            display: inline-block; width: 12px; height: 12px; border: 2px solid var(--border-color);
            border-top-color: var(--text-primary); border-radius: 50%; animation: kwSpin 0.8s linear infinite;
          }
          @keyframes kwSpin { to { transform: rotate(360deg); } }

          /* Floating mobile toggle button (Android) */
          .${CONFIG.namespace}-fab {
            position: fixed; z-index: 2147483646; right: 16px; bottom: 16px; width: 56px; height: 56px; border-radius: 50%;
            border: 1px solid var(--border-color); background: var(--fab-bg); color: var(--text-primary); display: none; align-items: center; justify-content: center;
            font-size: 22px; box-shadow: 0 8px 24px rgba(0,0,0,0.25); cursor: pointer;
          }
          .${CONFIG.namespace}-fab.visible { display: flex; }
          .${CONFIG.namespace}-fab:active { transform: scale(0.98); }

          /* Theme Variables */
          .${CONFIG.namespace}-overlay[data-theme="dark"],
          .${CONFIG.namespace}-fab[data-theme="dark"] {
            --bg-primary: #141416; --chat-bg: #0e0f11; --header-bg: #1f1f23; --header-bg-2: #191a1e; --sidebar-bg: #16171a;
            --settings-bg: #16171a; --input-area-bg: #15161a; --message-bg: #1a1b20; --message-user-bg: #171a28; --input-bg: #101114;
            --code-bg: #0f1115; --btn-bg: #1a1b20; --btn-hover: #22242b; --border-color: #2a2c33; --pill-bg: #15161a;
            --text-primary: #e6e6ea; --text-secondary: #a8acb8; --user-avatar: #5865f2; --assistant-avatar: #0ea57a; --system-avatar: #6b7280;
            --history-item-bg: #131418; --history-item-hover: #1a1b20; --fab-bg: #1d1e23;
          }
          .${CONFIG.namespace}-overlay[data-theme="light"],
          .${CONFIG.namespace}-fab[data-theme="light"] {
            --bg-primary: #ffffff; --chat-bg: #fbfbfd; --header-bg: #f7f7fb; --header-bg-2: #f1f2f7; --sidebar-bg: #fafbff;
            --settings-bg: #f6f7fb; --input-area-bg: #f6f7fb; --message-bg: #f4f6fa; --message-user-bg: #eef3ff; --input-bg: #ffffff;
            --code-bg: #f1f2f7; --btn-bg: #f1f2f7; --btn-hover: #e7e9f2; --border-color: #dfe3ee; --pill-bg: #eef1f9;
            --text-primary: #0e1117; --text-secondary: #626b7f; --user-avatar: #5865f2; --assistant-avatar: #0ea57a; --system-avatar: #6b7280;
            --history-item-bg: #f4f6fa; --history-item-hover: #eaeef8; --fab-bg: #ffffff;
          }

          /* Mobile tweaks */
          @media (max-width: 768px) {
            .${CONFIG.namespace}-overlay { width: 100% !important; height: 100% !important; top: 0 !important; left: 0 !important; border-radius: 0; }
            .${CONFIG.namespace}-sidebar { display: none; }
            .${CONFIG.namespace}-header { padding: 16px; }
            .${CONFIG.namespace}-resize-handle { display: none; }
          }
        `;
        document.head.appendChild(style);
      }

      createOverlay() {
        this.host = document.createElement('div');
        this.host.className = `${CONFIG.namespace}-overlay ${this.state.visible ? 'visible' : ''}`;
        this.host.setAttribute('data-theme', this.state.theme);
        this.host.style.left = `${this.state.position.x}px`;
        this.host.style.top = `${this.state.position.y}px`;
        this.host.style.width = `${this.state.size.width}px`;
        this.host.style.height = `${this.state.size.height}px`;

        try {
          this.shadowRoot = this.host.attachShadow({ mode: 'open' });
        } catch (e) {
          console.warn('[Khanware] Shadow DOM not supported, falling back to light DOM:', e);
          this.shadowRoot = this.host; // fallback: use host as root
        }

        // Styles into shadow root (clone to scope)
        const styleClone = document.getElementById(`${CONFIG.namespace}-styles`)?.cloneNode(true);
        if (styleClone) this.shadowRoot.appendChild(styleClone);

        const container = document.createElement('div');
        container.className = `${CONFIG.namespace}-container`;
        container.innerHTML = `
          <div class="${CONFIG.namespace}-header">
            <div class="${CONFIG.namespace}-title">
              <div class="${CONFIG.namespace}-title-text">Khanware Chat</div>
              <div class="${CONFIG.namespace}-status-pill" id="status-pill">${CONFIG.models[this.state.model].name} • ${this.state.effort}</div>
            </div>
            <div class="${CONFIG.namespace}-controls">
              <button class="${CONFIG.namespace}-btn ${CONFIG.namespace}-icon-btn" data-action="theme" title="Toggle theme">🌓</button>
              <button class="${CONFIG.namespace}-btn" data-action="new-chat" title="New chat">New</button>
              <button class="${CONFIG.namespace}-btn" data-action="export" title="Export to Markdown">Export</button>
              <button class="${CONFIG.namespace}-btn ${CONFIG.namespace}-icon-btn" data-action="minimize" title="Hide">−</button>
              <button class="${CONFIG.namespace}-btn ${CONFIG.namespace}-icon-btn" data-action="close" title="Close">×</button>
            </div>
          </div>
          <div class="${CONFIG.namespace}-body">
            <div class="${CONFIG.namespace}-sidebar">
              <div class="${CONFIG.namespace}-settings">
                <div class="${CONFIG.namespace}-input-group">
                  <label class="${CONFIG.namespace}-label">API Key</label>
                  <input type="password" class="${CONFIG.namespace}-input" id="api-key" placeholder="sk-..." value="${this.state.apiKey}">
                </div>
                <div class="${CONFIG.namespace}-input-group">
                  <label class="${CONFIG.namespace}-label">Model</label>
                  <select class="${CONFIG.namespace}-select" id="model-select">
                    ${Object.entries(CONFIG.models).map(([k, m]) => `<option value="${k}" ${k === this.state.model ? 'selected' : ''}>${m.name}</option>`).join('')}
                  </select>
                </div>
                <div class="${CONFIG.namespace}-input-group">
                  <label class="${CONFIG.namespace}-label">Reasoning Effort</label>
                  <select class="${CONFIG.namespace}-select" id="effort-select">
                    ${CONFIG.reasoningEfforts.map(e => `<option value="${e}" ${this.state.effort === e ? 'selected' : ''}>${e[0].toUpperCase() + e.slice(1)}</option>`).join('')}
                  </select>
                </div>
                <button class="${CONFIG.namespace}-btn" data-action="new-chat">+ New Chat</button>
              </div>
              <div class="${CONFIG.namespace}-history" id="chat-history"></div>
            </div>
            <div class="${CONFIG.namespace}-main">
              <div class="${CONFIG.namespace}-messages" id="messages"></div>
              <div class="${CONFIG.namespace}-input-area">
                <div class="${CONFIG.namespace}-attached-images" id="attached-images"></div>
                <textarea class="${CONFIG.namespace}-textarea" id="message-input" placeholder="Type a message... (Ctrl+Enter to send, /help for commands)"></textarea>
                <div class="${CONFIG.namespace}-input-controls">
                  <div style="font-size: 12px; color: var(--text-secondary);">Tip: Press Ctrl+Enter to send</div>
                  <button class="${CONFIG.namespace}-btn ${CONFIG.namespace}-send-btn" data-action="send">Send</button>
                </div>
              </div>
            </div>
          </div>
          <div class="${CONFIG.namespace}-resize-handle"></div>
        `;

        this.shadowRoot.appendChild(container);
        document.body.appendChild(this.host);

        this.elements = {
          messages: this.shadowRoot.getElementById('messages'),
          input: this.shadowRoot.getElementById('message-input'),
          apiKey: this.shadowRoot.getElementById('api-key'),
          modelSelect: this.shadowRoot.getElementById('model-select'),
          effortSelect: this.shadowRoot.getElementById('effort-select'),
          attachedImages: this.shadowRoot.getElementById('attached-images'),
          chatHistory: this.shadowRoot.getElementById('chat-history'),
          header: this.shadowRoot.querySelector(`.${CONFIG.namespace}-header`),
          resizeHandle: this.shadowRoot.querySelector(`.${CONFIG.namespace}-resize-handle`),
          statusPill: this.shadowRoot.getElementById('status-pill')
        };
      }

      createMobileToggleButton() {
        const btn = document.createElement('button');
        btn.className = `${CONFIG.namespace}-fab`;
        btn.setAttribute('data-theme', this.state.theme);
        btn.innerHTML = '💬';
        btn.title = 'Open Khanware Chat';

        if (isAndroid()) btn.classList.add('visible');
        btn.addEventListener('click', () => this.toggle());

        document.body.appendChild(btn);
        this.mobileToggleBtn = btn;
        this.updateFabVisibility();
      }

      updateFabVisibility() {
        if (!this.mobileToggleBtn) return;
        if (isAndroid()) this.mobileToggleBtn.classList.add('visible');
        else this.mobileToggleBtn.classList.remove('visible');
        this.mobileToggleBtn.setAttribute('data-theme', this.state.theme);
      }

      attachEventListeners() {
        // Bind once, remove cleanly on destroy
        this._handlers.globalKeydown = this.handleGlobalKeydown.bind(this);
        this._handlers.docClick = this.handleImageClick.bind(this);
        this._handlers.mouseMove = this.handleMouseMove.bind(this);
        this._handlers.mouseUp = this.handleMouseUp.bind(this);
        this._handlers.touchMove = this.handleMouseMove.bind(this);
        this._handlers.touchEnd = this.handleMouseUp.bind(this);

        document.addEventListener('keydown', this._handlers.globalKeydown);
        this.shadowRoot.addEventListener('click', this.handleClick.bind(this));
        this.shadowRoot.addEventListener('change', this.handleChange.bind(this));

        this.elements.header.addEventListener('mousedown', this.startDrag.bind(this));
        this.elements.header.addEventListener('touchstart', this.startDrag.bind(this), { passive: false });

        this.elements.resizeHandle.addEventListener('mousedown', this.startResize.bind(this));
        this.elements.resizeHandle.addEventListener('touchstart', this.startResize.bind(this), { passive: false });

        this.elements.input.addEventListener('keydown', this.handleInputKeydown.bind(this));

        document.addEventListener('click', this._handlers.docClick);
        document.addEventListener('mousemove', this._handlers.mouseMove);
        document.addEventListener('mouseup', this._handlers.mouseUp);
        document.addEventListener('touchmove', this._handlers.touchMove, { passive: false });
        document.addEventListener('touchend', this._handlers.touchEnd);
      }

      handleGlobalKeydown(e) {
        if ((e.key === 'g' || e.key === 'G') && !e.target.matches('input, textarea')) this.toggle();
        if (e.key === 'Escape' && this.state.visible) this.hide();
      }

      handleClick(e) {
        const action = e.target.dataset.action;
        if (!action) return;
        switch (action) {
          case 'theme': this.toggleTheme(); break;
          case 'minimize': this.hide(); break;
          case 'close': this.destroy(); break;
          case 'send': this.sendMessage(); break;
          case 'copy': this.copyMessage(e.target); break;
          case 'retry': this.retryMessage(); break;
          case 'export': this.exportToMarkdown(); break;
          case 'new-chat': this.newChat(); break;
        }
      }

      handleChange(e) {
        if (e.target.id === 'api-key') {
          this.state.apiKey = e.target.value; this.saveState();
        } else if (e.target.id === 'model-select') {
          this.state.model = e.target.value; this.updateStatusPill(); this.saveState();
        } else if (e.target.id === 'effort-select') {
          this.state.effort = e.target.value; this.updateStatusPill(); this.saveState();
        }
      }

      updateStatusPill() {
        if (this.elements.statusPill) {
          this.elements.statusPill.textContent = `${CONFIG.models[this.state.model].name} • ${this.state.effort}`;
        }
      }

      handleInputKeydown(e) {
        if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); this.sendMessage(); }
        if (e.key === 'Enter' && this.elements.input.value.startsWith('/')) {
          e.preventDefault();
          this.handleCommand(this.elements.input.value);
        }
      }

      handleImageClick(e) {
        if (e.target.tagName === 'IMG' && this.state.visible) {
          e.preventDefault();
          e.stopPropagation();
          this.attachImage(e.target);
        }
      }

      startDrag(e) {
        if (e.type === 'touchstart') {
          e.preventDefault();
          const t = e.touches[0];
          this.touchStartPos = { x: t.clientX, y: t.clientY };
          this.dragOffset = { x: t.clientX - this.state.position.x, y: t.clientY - this.state.position.y };
        } else {
          this.dragOffset = { x: e.clientX - this.state.position.x, y: e.clientY - this.state.position.y };
        }
        this.isDragging = true;
        this.host.style.cursor = 'grabbing';
      }

      startResize(e) {
        if (e.type === 'touchstart') e.preventDefault();
        this.isResizing = true;
      }

      handleMouseMove(e) {
        if (this.isDragging) {
          e.preventDefault();
          const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
          const clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;
          this.state.position.x = clientX - this.dragOffset.x;
          this.state.position.y = clientY - this.dragOffset.y;
          this.host.style.left = `${this.state.position.x}px`;
          this.host.style.top = `${this.state.position.y}px`;
        }
        if (this.isResizing) {
          e.preventDefault();
          const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
          const clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;
          this.state.size.width = Math.max(320, clientX - this.state.position.x);
          this.state.size.height = Math.max(420, clientY - this.state.position.y);
          this.host.style.width = `${this.state.size.width}px`;
          this.host.style.height = `${this.state.size.height}px`;
        }
      }

      handleMouseUp() {
        if (this.isDragging || this.isResizing) {
          this.isDragging = false;
          this.isResizing = false;
          this.host.style.cursor = '';
          this.saveState();
        }
      }

      handleCommand(command) {
        const cmd = command.trim().toLowerCase();
        switch (cmd) {
          case '/clear': this.clearChat(); break;
          case '/reset': this.resetAll(); break;
          case '/download': this.downloadChat(); break;
          case '/help': this.showHelp(); break;
          default: this.addMessage('system', `Unknown command: ${cmd}`);
        }
        this.elements.input.value = '';
      }

      ensureSystemPrompt() {
        if (this.systemPromptInjected) return;
        if (SYSTEM_PROMPT && typeof SYSTEM_PROMPT === 'string' && SYSTEM_PROMPT.trim()) {
          this.currentChat.unshift({ role: 'system', content: SYSTEM_PROMPT.trim() });
          this.systemPromptInjected = true;
        }
      }

      async sendMessage() {
        const message = this.elements.input.value.trim();
        if (!message && this.attachedImages.length === 0) return;

        if (!this.state.apiKey) {
          this.addMessage('system', 'Please enter your OpenAI API key first.');
          kwToast('Missing API key.');
          return;
        }

        this.ensureSystemPrompt();

        const userMessage = { role: 'user', content: message };
        if (this.attachedImages.length > 0) {
          userMessage.content = [
            { type: 'text', text: message },
            ...this.attachedImages.map((img) => ({ type: 'image_url', image_url: { url: img } }))
          ];
        }

        this.currentChat.push(userMessage);
        this.addMessage('user', message, this.attachedImages);
        this.elements.input.value = '';
        this.clearAttachedImages();

        const assistantMsgId = this.addMessage('assistant', '', [], true);

        try {
          await this.streamCompletion(assistantMsgId);
        } catch (error) {
          console.error('[Khanware] streamCompletion error:', error);
          this.updateMessage(assistantMsgId, `Error: ${error.message || error}`);
          kwToast('API error: ' + (error.message || error));
        }
      }

      async streamCompletion(messageId) {
        this.abortController = new AbortController();

        const body = {
          model: this.state.model,
          messages: this.currentChat,
          stream: true,
          reasoning_effort: this.state.effort
        };

        const url = 'https://api.openai.com/v1/chat/completions';
        const headers = {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.state.apiKey}`
        };

        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: this.abortController.signal
        });

        // If streaming is not supported or blocked, fallback to non-stream
        if (!response.ok) {
          const text = await response.text().catch(() => '');
          throw new Error(`API Error: ${response.status} ${response.statusText}${text ? ' - ' + text : ''}`);
        }

        if (!response.body || !response.body.getReader) {
          // Non-stream fallback
          const text = await response.text();
          let json;
          try { json = JSON.parse(text); } catch (e) { throw new Error('Invalid JSON response'); }
          const content = json?.choices?.[0]?.message?.content || '';
          this.currentChat.push({ role: 'assistant', content });
          this.updateMessage(messageId, content);
          await this.saveChatToHistory().catch(() => {});
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullContent = '';

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              const data = line.slice(6).trim();
              if (data === '[DONE]') continue;
              try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta?.content;
                if (typeof delta === 'string' && delta.length) {
                  fullContent += delta;
                  this.updateMessage(messageId, fullContent);
                }
              } catch (_) {
                // ignore malformed chunk
              }
            }
          }
        } catch (streamErr) {
          console.warn('[Khanware] Stream interrupted, trying non-stream fallback:', streamErr);
          // Best effort fallback (non-stream)
          const rsp = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ ...body, stream: false }) });
          const j = await rsp.json().catch(() => ({}));
          const content = j?.choices?.[0]?.message?.content || fullContent || '...';
          this.updateMessage(messageId, content);
          fullContent = content;
        }

        this.currentChat.push({ role: 'assistant', content: fullContent });
        await this.saveChatToHistory().catch(() => {});

        // Add actions (copy/retry)
        const msgEl = this.shadowRoot.getElementById(messageId);
        if (msgEl) {
          const contentDiv = msgEl.querySelector(`.${CONFIG.namespace}-message-content`);
          if (contentDiv) {
            contentDiv.innerHTML = this.formatMessage(fullContent);
            const actionsDiv = document.createElement('div');
            actionsDiv.className = `${CONFIG.namespace}-message-actions`;
            actionsDiv.innerHTML = `
              <button class="${CONFIG.namespace}-btn ${CONFIG.namespace}-icon-btn" data-action="copy" title="Copy">📋</button>
              <button class="${CONFIG.namespace}-btn ${CONFIG.namespace}-icon-btn" data-action="retry" title="Retry">🔄</button>
            `;
            contentDiv.appendChild(actionsDiv);
          }
        }
      }

      addMessage(role, content, images = [], isStreaming = false) {
        const messageId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const messageDiv = document.createElement('div');
        messageDiv.className = `${CONFIG.namespace}-message ${role}`;
        messageDiv.id = messageId;

        const avatarDiv = document.createElement('div');
        avatarDiv.className = `${CONFIG.namespace}-avatar ${role}`;
        avatarDiv.textContent = role === 'user' ? 'U' : role === 'assistant' ? 'A' : 'S';

        const contentDiv = document.createElement('div');
        contentDiv.className = `${CONFIG.namespace}-message-content`;

        if (images.length > 0) {
          const imagesHtml = images
            .map((img) => `<img src="${img}" style="max-width: 220px; margin: 4px; border-radius: 8px; border:1px solid var(--border-color);" />`)
            .join('');
          contentDiv.innerHTML = imagesHtml + '<br/>';
        }

        if (isStreaming) {
          contentDiv.innerHTML += `<span class="${CONFIG.namespace}-loading"></span>`;
        } else {
          contentDiv.innerHTML += this.formatMessage(content);
          if (role === 'assistant') {
            const actionsDiv = document.createElement('div');
            actionsDiv.className = `${CONFIG.namespace}-message-actions`;
            actionsDiv.innerHTML = `
              <button class="${CONFIG.namespace}-btn ${CONFIG.namespace}-icon-btn" data-action="copy" title="Copy">📋</button>
              <button class="${CONFIG.namespace}-btn ${CONFIG.namespace}-icon-btn" data-action="retry" title="Retry">🔄</button>
            `;
            contentDiv.appendChild(actionsDiv);
          }
        }

        messageDiv.appendChild(avatarDiv);
        messageDiv.appendChild(contentDiv);
        this.elements.messages.appendChild(messageDiv);
        this.elements.messages.scrollTop = this.elements.messages.scrollHeight;

        return messageId;
      }

      updateMessage(messageId, content) {
        const message = this.shadowRoot.getElementById(messageId);
        if (message) {
          const contentDiv = message.querySelector(`.${CONFIG.namespace}-message-content`);
          if (contentDiv) contentDiv.innerHTML = this.formatMessage(content);
          this.elements.messages.scrollTop = this.elements.messages.scrollHeight;
        }
      }

      formatMessage(content) {
        if (Array.isArray(content)) {
          const textPart = content.find((c) => c.type === 'text')?.text || '';
          return this.formatMessage(textPart);
        }
        return String(content)
          .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
          .replace(/`([^`]+)`/g, '<code>$1</code>')
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.*?)\*/g, '<em>$1</em>')
          .replace(/\n/g, '<br>');
      }

      attachImage(img) {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || img.width;
          canvas.height = img.naturalHeight || img.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          const dataUrl = canvas.toDataURL('image/png');

          this.attachedImages.push(dataUrl);
          this.renderAttachedImages();
          this.addMessage('system', 'Image attached successfully!');
        } catch (error) {
          this.addMessage('system', `Failed to attach image: ${error.message}`);
        }
      }

      renderAttachedImages() {
        this.elements.attachedImages.innerHTML = this.attachedImages
          .map(
            (img, index) => `
          <div class="${CONFIG.namespace}-attached-image">
            <img src="${img}" alt="Attached ${index + 1}">
            <button class="${CONFIG.namespace}-remove-image" data-index="${index}">×</button>
          </div>
        `
          )
          .join('');

        this.shadowRoot.querySelectorAll(`.${CONFIG.namespace}-remove-image`).forEach((btn) => {
          btn.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.index, 10);
            this.attachedImages.splice(index, 1);
            this.renderAttachedImages();
          });
        });
      }

      clearAttachedImages() {
        this.attachedImages = [];
        this.renderAttachedImages();
      }

      async saveChatToHistory() {
        if (!this.db) return;
        try {
          const tx = this.db.transaction([CONFIG.storeName], 'readwrite');
          const store = tx.objectStore(CONFIG.storeName);
          const chatData = { timestamp: Date.now(), messages: this.currentChat, model: this.state.model };
          await new Promise((res, rej) => {
            const req = store.add(chatData);
            req.onsuccess = () => res();
            req.onerror = () => rej(req.error);
          });
          this.loadChatHistory().catch(() => {});
        } catch (e) {
          console.warn('[Khanware] saveChatToHistory failed:', e);
        }
      }

      async loadChatHistory() {
        if (!this.db) return;
        return new Promise((resolve) => {
          const tx = this.db.transaction([CONFIG.storeName], 'readonly');
          const store = tx.objectStore(CONFIG.storeName);
          const idx = store.index('timestamp');

          const chats = [];
          const cursorReq = idx.openCursor(null, 'prev');
          cursorReq.onsuccess = (event) => {
            const c = event.target.result;
            if (c && chats.length < 30) {
              chats.push(c.value);
              c.continue();
            } else {
              this.renderChatHistory(chats);
              resolve();
            }
          };
          cursorReq.onerror = () => resolve();
        });
      }

      renderChatHistory(chats) {
        this.elements.chatHistory.innerHTML = chats
          .map((chat) => {
            const date = new Date(chat.timestamp);
            const firstUserMsg = chat.messages.find((m) => m.role === 'user')?.content || '';
            const previewText = typeof firstUserMsg === 'string' ? firstUserMsg : firstUserMsg?.[0]?.text || 'Image';
            return `
              <div class="${CONFIG.namespace}-history-item" data-id="${chat.id}">
                <div style="font-weight:600; font-size:12px;">${date.toLocaleDateString()} ${date.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
                <div style="font-size:11px; margin-top:4px;">${previewText.substring(0, 60)}${previewText.length > 60 ? '…' : ''}</div>
              </div>
            `;
          })
          .join('');

        this.shadowRoot.querySelectorAll(`.${CONFIG.namespace}-history-item`).forEach((item) => {
          item.addEventListener('click', () => this.loadChat(item.dataset.id));
        });
      }

      async loadChat(chatId) {
        if (!this.db) return;
        const tx = this.db.transaction([CONFIG.storeName], 'readonly');
        const store = tx.objectStore(CONFIG.storeName);
        const req = store.get(parseInt(chatId, 10));
        req.onsuccess = () => {
          const chat = req.result;
          if (!chat) return;
          this.currentChat = chat.messages;
          this.systemPromptInjected = !!this.currentChat.find((m) => m.role === 'system');
          this.elements.messages.innerHTML = '';
          this.currentChat.forEach((msg) => {
            if (msg.role !== 'system') {
              const content = typeof msg.content === 'string' ? msg.content : msg.content?.[0]?.text || '';
              this.addMessage(msg.role, content);
            }
          });
        };
      }

      exportToMarkdown() {
        const out = [];
        out.push(`# Khanware Chat Export`, '');
        out.push(`Date: ${new Date().toLocaleString()}`);
        out.push(`Model: ${this.state.model}`);
        out.push(`Reasoning Effort: ${this.state.effort}`);
        if (SYSTEM_PROMPT) {
          out.push('', 'System Prompt:', '', '```', SYSTEM_PROMPT, '```');
        }
        out.push('', '---', '');

        this.currentChat.forEach((msg) => {
          if (msg.role === 'user') {
            out.push('## User', typeof msg.content === 'string' ? msg.content : (msg.content?.[0]?.text || '[image]'), '');
          } else if (msg.role === 'assistant') {
            out.push('## Assistant', typeof msg.content === 'string' ? msg.content : (msg.content?.[0]?.text || ''), '');
          }
        });

        const blob = new Blob([out.join('\n')], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `khanware-chat-${Date.now()}.md`;
        a.click();
        URL.revokeObjectURL(url);
      }

      copyMessage(button) {
        const content = button.closest(`.${CONFIG.namespace}-message-content`).textContent || '';
        navigator.clipboard.writeText(content).then(
          () => {
            button.textContent = '✓';
            setTimeout(() => (button.textContent = '📋'), 1500);
          },
          () => kwToast('Copy failed.')
        );
      }

      retryMessage() {
        if (this.currentChat.length > 0) {
          if (this.currentChat[this.currentChat.length - 1].role === 'assistant') {
            this.currentChat.pop();
          }
          const messages = this.shadowRoot.querySelectorAll(`.${CONFIG.namespace}-message`);
          if (messages.length > 0) messages[messages.length - 1].remove();
          this.sendMessage();
        }
      }

      newChat() {
        this.currentChat = [];
        this.systemPromptInjected = false;
        this.elements.messages.innerHTML = '';
        this.addMessage('system', 'New chat started.');
      }

      clearChat() {
        this.currentChat = [];
        this.systemPromptInjected = false;
        this.elements.messages.innerHTML = '';
        this.addMessage('system', 'Chat cleared.');
      }

      resetAll() {
        if (confirm('This will clear all data including history. Continue?')) {
          try { localStorage.removeItem(`${CONFIG.namespace}_state`); } catch (_) {}
          try { indexedDB.deleteDatabase(CONFIG.dbName); } catch (_) {}
          this.destroy();
          kwToast('Khanware reset. Run the bookmarklet again to reload.');
        }
      }

      downloadChat() {
        const json = JSON.stringify(this.currentChat, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `khanware-chat-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }

      showHelp() {
        const helpText = `
Available Commands:
  /clear    - Clear current chat
  /reset    - Reset all data
  /download - Download chat as JSON
  /help     - Show this help

Shortcuts:
  G         - Toggle chat window
  Esc       - Close chat
  Ctrl+Enter- Send message

Tip: Tap any image on the page to attach it.`;
        this.addMessage('system', helpText);
      }

      toggleTheme() {
        this.state.theme = this.state.theme === 'dark' ? 'light' : 'dark';
        this.host.setAttribute('data-theme', this.state.theme);
        this.saveState();
        this.updateFabVisibility();
      }

      toggle() {
        if (this.state.visible) this.hide();
        else this.show();
      }

      show() {
        this.state.visible = true;
        this.host.classList.add('visible');
        this.saveState();
        this.elements.input?.focus();
      }

      hide() {
        this.state.visible = false;
        this.host.classList.remove('visible');
        this.saveState();
      }

      destroy() {
        // Remove listeners
        document.removeEventListener('keydown', this._handlers.globalKeydown);
        document.removeEventListener('click', this._handlers.docClick);
        document.removeEventListener('mousemove', this._handlers.mouseMove);
        document.removeEventListener('mouseup', this._handlers.mouseUp);
        document.removeEventListener('touchmove', this._handlers.touchMove);
        document.removeEventListener('touchend', this._handlers.touchEnd);

        window.removeEventListener('error', onWinError);
        window.removeEventListener('unhandledrejection', onWinRejection);

        if (this.abortController) this.abortController.abort();
        try { this.db?.close(); } catch (_) {}

        try { this.host?.remove(); } catch (_) {}
        try { this.mobileToggleBtn?.remove(); } catch (_) {}
        try { document.getElementById(`${CONFIG.namespace}-styles`)?.remove(); } catch (_) {}

        window.__khanware_instance = null;
        window.__khanware_loaded = false;
        kwToast('Khanware unloaded.');
      }
    }

    // Initialize
    window.__khanware_instance = new KhanwareChat();
    // Expose unload
    window.__khanware_unload = function () {
      if (window.__khanware_instance) {
        window.__khanware_instance.destroy();
      }
    };
  } catch (fatal) {
    console.error('[Khanware] Fatal bootstrap error:', fatal);
    kwToast('Khanware failed: ' + (fatal?.message || fatal));
  }
})();
