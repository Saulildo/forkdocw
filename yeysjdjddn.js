// Khanware.js - Advanced Chat Overlay System (Cleaned + Redesigned)
(function () {
  'use strict';

  // ========= USER SETTINGS (Edit these two lines) =========
  const OPENAI_API_KEY = ''; // <-- Put your OpenAI API key here (or leave blank to paste it in the UI)
  const SYSTEM_PROMPT = 'You are a helpful, concise assistant. Keep answers clear and useful.';
  // ========================================================

  if (window.__khanware_loaded) {
    console.log('Khanware already loaded');
    return;
  }
  window.__khanware_loaded = true;

  // Configuration
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
    reasoningEfforts: ['low', 'medium', 'high'] // used as reasoning_effort
  };

  // Helpers
  const isAndroid = () => /android/i.test(navigator.userAgent);

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

      this.init();
    }

    loadState() {
      const saved = localStorage.getItem(`${CONFIG.namespace}_state`);
      return saved
        ? JSON.parse(saved)
        : {
            visible: false,
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
      localStorage.setItem(`${CONFIG.namespace}_state`, JSON.stringify(this.state));
    }

    async init() {
      await this.initDB();
      this.createStyles();
      this.createOverlay();
      this.attachEventListeners();
      this.loadChatHistory();
      this.createMobileToggleButton();

      if (this.state.visible) this.show();
      console.log('Khanware loaded successfully! Press G to toggle the chat.');
    }

    async initDB() {
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
            const store = db.createObjectStore(CONFIG.storeName, {
              keyPath: 'id',
              autoIncrement: true
            });
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
          position: fixed;
          z-index: 2147483647;
          font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Inter, Helvetica, Arial, Apple Color Emoji, Segoe UI Emoji;
          box-shadow: 0 10px 40px rgba(0,0,0,0.25);
          border-radius: 16px;
          overflow: hidden;
          display: none;
          touch-action: none;
          backdrop-filter: blur(6px);
          border: 1px solid var(--border-color);
        }
        .${CONFIG.namespace}-overlay.visible { display: flex; }

        .${CONFIG.namespace}-container { width: 100%; height: 100%; display: flex; flex-direction: column; }

        .${CONFIG.namespace}-header {
          padding: 12px 14px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          cursor: move;
          user-select: none;
          border-bottom: 1px solid var(--border-color);
          background: linear-gradient(180deg, var(--header-bg) 0%, var(--header-bg-2) 100%);
          -webkit-touch-callout: none;
        }
        .${CONFIG.namespace}-title {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .${CONFIG.namespace}-title-text {
          font-weight: 700;
          font-size: 14px;
          color: var(--text-primary);
          letter-spacing: 0.2px;
        }
        .${CONFIG.namespace}-status-pill {
          font-size: 11px;
          color: var(--text-secondary);
          background: var(--pill-bg);
          border: 1px solid var(--border-color);
          padding: 4px 8px;
          border-radius: 999px;
        }

        .${CONFIG.namespace}-controls {
          display: flex;
          gap: 6px;
        }
        .${CONFIG.namespace}-btn {
          padding: 6px 10px;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          cursor: pointer;
          font-size: 12px;
          transition: all 0.15s ease;
          background: var(--btn-bg);
          color: var(--text-primary);
        }
        .${CONFIG.namespace}-btn:hover { background: var(--btn-hover); transform: translateY(-1px); }
        .${CONFIG.namespace}-btn:active { transform: translateY(0); }
        .${CONFIG.namespace}-icon-btn { width: 30px; height: 30px; padding: 0; display: flex; align-items: center; justify-content: center; }

        .${CONFIG.namespace}-body { flex: 1; display: flex; background: var(--bg-primary); overflow: hidden; }
        .${CONFIG.namespace}-sidebar {
          width: 220px;
          border-right: 1px solid var(--border-color);
          display: flex;
          flex-direction: column;
          background: var(--sidebar-bg);
        }
        .${CONFIG.namespace}-settings {
          padding: 12px;
          border-bottom: 1px solid var(--border-color);
          background: var(--settings-bg);
          display: grid;
          gap: 10px;
        }
        .${CONFIG.namespace}-input-group { display: grid; gap: 6px; }
        .${CONFIG.namespace}-label { font-size: 11px; color: var(--text-secondary); }
        .${CONFIG.namespace}-input, .${CONFIG.namespace}-select {
          width: 100%;
          padding: 8px 10px;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          font-size: 12px;
          background: var(--input-bg);
          color: var(--text-primary);
          outline: none;
        }
        .${CONFIG.namespace}-new-chat { margin-top: 4px; }

        .${CONFIG.namespace}-history { flex: 1; overflow-y: auto; padding: 8px; display: grid; gap: 6px; }
        .${CONFIG.namespace}-history-item {
          padding: 8px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 12px;
          background: var(--history-item-bg);
          color: var(--text-secondary);
          border: 1px solid var(--border-color);
          transition: all 0.15s ease;
        }
        .${CONFIG.namespace}-history-item:hover { background: var(--history-item-hover); color: var(--text-primary); transform: translateY(-1px); }

        .${CONFIG.namespace}-main { flex: 1; display: flex; flex-direction: column; }
        .${CONFIG.namespace}-messages {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          background: var(--chat-bg);
        }
        .${CONFIG.namespace}-message { display: flex; gap: 10px; animation: fadeIn 0.25s ease; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }

        .${CONFIG.namespace}-avatar {
          width: 28px; height: 28px; border-radius: 8px;
          display: flex; align-items: center; justify-content: center;
          font-size: 13px; font-weight: 700; flex-shrink: 0; color: white;
        }
        .${CONFIG.namespace}-avatar.user { background: var(--user-avatar); }
        .${CONFIG.namespace}-avatar.assistant { background: var(--assistant-avatar); }
        .${CONFIG.namespace}-avatar.system { background: var(--system-avatar); }

        .${CONFIG.namespace}-message-content {
          flex: 1;
          padding: 10px 12px;
          border-radius: 12px;
          background: var(--message-bg);
          color: var(--text-primary);
          font-size: 14px;
          line-height: 1.5;
          word-wrap: break-word;
          border: 1px solid var(--border-color);
        }
        .${CONFIG.namespace}-message.user .${CONFIG.namespace}-message-content {
          background: var(--message-user-bg);
        }
        .${CONFIG.namespace}-message-content pre {
          background: var(--code-bg);
          padding: 8px;
          border-radius: 8px;
          overflow-x: auto;
          border: 1px solid var(--border-color);
        }
        .${CONFIG.namespace}-message-content code {
          background: var(--code-bg);
          padding: 2px 4px;
          border-radius: 4px;
          font-size: 13px;
        }
        .${CONFIG.namespace}-message-actions { display: flex; gap: 6px; margin-top: 8px; }

        .${CONFIG.namespace}-input-area {
          padding: 12px;
          border-top: 1px solid var(--border-color);
          background: var(--input-area-bg);
          display: grid; gap: 10px;
        }
        .${CONFIG.namespace}-attached-images { display: flex; gap: 8px; flex-wrap: wrap; }
        .${CONFIG.namespace}-attached-image {
          position: relative; width: 64px; height: 64px; border-radius: 8px; overflow: hidden; border: 1px solid var(--border-color);
        }
        .${CONFIG.namespace}-attached-image img { width: 100%; height: 100%; object-fit: cover; }
        .${CONFIG.namespace}-remove-image {
          position: absolute; top: 4px; right: 4px; width: 22px; height: 22px;
          background: rgba(0,0,0,0.75); color: white; border: none; border-radius: 50%;
          cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 12px;
        }
        .${CONFIG.namespace}-textarea {
          width: 100%;
          min-height: 64px;
          max-height: 160px;
          padding: 10px 12px;
          border: 1px solid var(--border-color);
          border-radius: 10px;
          resize: vertical;
          font-size: 14px;
          font-family: inherit;
          background: var(--input-bg);
          color: var(--text-primary);
          outline: none;
        }
        .${CONFIG.namespace}-input-controls {
          display: flex; justify-content: space-between; align-items: center;
        }
        .${CONFIG.namespace}-send-btn { font-weight: 600; }

        .${CONFIG.namespace}-resize-handle {
          position: absolute; bottom: 0; right: 0; width: 20px; height: 20px; cursor: nwse-resize;
          background: linear-gradient(135deg, transparent 50%, var(--border-color) 50%);
        }

        .${CONFIG.namespace}-loading {
          display: inline-block; width: 12px; height: 12px;
          border: 2px solid var(--border-color);
          border-top-color: var(--text-primary);
          border-radius: 50%; animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* Floating mobile toggle button (Android) */
        .${CONFIG.namespace}-fab {
          position: fixed;
          z-index: 2147483646;
          right: 16px;
          bottom: 16px;
          width: 56px;
          height: 56px;
          border-radius: 50%;
          border: 1px solid var(--border-color);
          background: var(--fab-bg);
          color: var(--text-primary);
          display: none;
          align-items: center;
          justify-content: center;
          font-size: 22px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.25);
          cursor: pointer;
        }
        .${CONFIG.namespace}-fab.visible { display: flex; }
        .${CONFIG.namespace}-fab:active { transform: scale(0.98); }

        /* Theme Variables */
        .${CONFIG.namespace}-overlay[data-theme="dark"],
        .${CONFIG.namespace}-fab[data-theme="dark"] {
          --bg-primary: #141416;
          --chat-bg: #0e0f11;
          --header-bg: #1f1f23;
          --header-bg-2: #191a1e;
          --sidebar-bg: #16171a;
          --settings-bg: #16171a;
          --input-area-bg: #15161a;
          --message-bg: #1a1b20;
          --message-user-bg: #171a28;
          --input-bg: #101114;
          --code-bg: #0f1115;
          --btn-bg: #1a1b20;
          --btn-hover: #22242b;
          --border-color: #2a2c33;
          --pill-bg: #15161a;
          --text-primary: #e6e6ea;
          --text-secondary: #a8acb8;
          --user-avatar: #5865f2;
          --assistant-avatar: #0ea57a;
          --system-avatar: #6b7280;
          --history-item-bg: #131418;
          --history-item-hover: #1a1b20;
          --fab-bg: #1d1e23;
        }
        .${CONFIG.namespace}-overlay[data-theme="light"],
        .${CONFIG.namespace}-fab[data-theme="light"] {
          --bg-primary: #ffffff;
          --chat-bg: #fbfbfd;
          --header-bg: #f7f7fb;
          --header-bg-2: #f1f2f7;
          --sidebar-bg: #fafbff;
          --settings-bg: #f6f7fb;
          --input-area-bg: #f6f7fb;
          --message-bg: #f4f6fa;
          --message-user-bg: #eef3ff;
          --input-bg: #ffffff;
          --code-bg: #f1f2f7;
          --btn-bg: #f1f2f7;
          --btn-hover: #e7e9f2;
          --border-color: #dfe3ee;
          --pill-bg: #eef1f9;
          --text-primary: #0e1117;
          --text-secondary: #626b7f;
          --user-avatar: #5865f2;
          --assistant-avatar: #0ea57a;
          --system-avatar: #6b7280;
          --history-item-bg: #f4f6fa;
          --history-item-hover: #eaeef8;
          --fab-bg: #ffffff;
        }

        /* Mobile optimizations */
        @media (max-width: 768px) {
          .${CONFIG.namespace}-overlay {
            width: 100% !important;
            height: 100% !important;
            top: 0 !important;
            left: 0 !important;
            border-radius: 0;
          }
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

      this.shadowRoot = this.host.attachShadow({ mode: 'open' });

      const styleClone = document.getElementById(`${CONFIG.namespace}-styles`).cloneNode(true);
      this.shadowRoot.appendChild(styleClone);

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
                  ${Object.entries(CONFIG.models)
                    .map(
                      ([key, model]) => `<option value="${key}" ${key === this.state.model ? 'selected' : ''}>${model.name}</option>`
                    )
                    .join('')}
                </select>
              </div>
              <div class="${CONFIG.namespace}-input-group">
                <label class="${CONFIG.namespace}-label">Reasoning Effort</label>
                <select class="${CONFIG.namespace}-select" id="effort-select">
                  ${CONFIG.reasoningEfforts
                    .map(
                      (e) => `<option value="${e}" ${this.state.effort === e ? 'selected' : ''}>${e[0].toUpperCase() + e.slice(1)}</option>`
                    )
                    .join('')}
                </select>
              </div>
              <button class="${CONFIG.namespace}-btn ${CONFIG.namespace}-new-chat" data-action="new-chat">+ New Chat</button>
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

      btn.addEventListener('click', () => {
        this.toggle();
      });

      document.body.appendChild(btn);
      this.mobileToggleBtn = btn;
      this.updateFabVisibility();
    }

    updateFabVisibility() {
      if (!this.mobileToggleBtn) return;
      if (isAndroid()) {
        this.mobileToggleBtn.classList.add('visible');
      } else {
        this.mobileToggleBtn.classList.remove('visible');
      }
      this.mobileToggleBtn.setAttribute('data-theme', this.state.theme);
    }

    attachEventListeners() {
      document.addEventListener('keydown', this.handleGlobalKeydown.bind(this));

      this.shadowRoot.addEventListener('click', this.handleClick.bind(this));
      this.shadowRoot.addEventListener('change', this.handleChange.bind(this));

      this.elements.header.addEventListener('mousedown', this.startDrag.bind(this));
      this.elements.header.addEventListener('touchstart', this.startDrag.bind(this), { passive: false });

      this.elements.resizeHandle.addEventListener('mousedown', this.startResize.bind(this));
      this.elements.resizeHandle.addEventListener('touchstart', this.startResize.bind(this), { passive: false });

      this.elements.input.addEventListener('keydown', this.handleInputKeydown.bind(this));

      document.addEventListener('click', this.handleImageClick.bind(this));

      document.addEventListener('mousemove', this.handleMouseMove.bind(this));
      document.addEventListener('mouseup', this.handleMouseUp.bind(this));
      document.addEventListener('touchmove', this.handleMouseMove.bind(this), { passive: false });
      document.addEventListener('touchend', this.handleMouseUp.bind(this));
    }

    handleGlobalKeydown(e) {
      if ((e.key === 'g' || e.key === 'G') && !e.target.matches('input, textarea')) this.toggle();
      if (e.key === 'Escape' && this.state.visible) this.hide();
    }

    handleClick(e) {
      const action = e.target.dataset.action;
      if (!action) return;

      switch (action) {
        case 'theme':
          this.toggleTheme();
          break;
        case 'minimize':
          this.hide();
          break;
        case 'close':
          this.destroy();
          break;
        case 'send':
          this.sendMessage();
          break;
        case 'copy':
          this.copyMessage(e.target);
          break;
        case 'retry':
          this.retryMessage();
          break;
        case 'export':
          this.exportToMarkdown();
          break;
        case 'new-chat':
          this.newChat();
          break;
      }
    }

    handleChange(e) {
      if (e.target.id === 'api-key') {
        this.state.apiKey = e.target.value;
        this.saveState();
      } else if (e.target.id === 'model-select') {
        this.state.model = e.target.value;
        this.updateStatusPill();
        this.saveState();
      } else if (e.target.id === 'effort-select') {
        this.state.effort = e.target.value;
        this.updateStatusPill();
        this.saveState();
      }
    }

    updateStatusPill() {
      if (!this.elements.statusPill) return;
      this.elements.statusPill.textContent = `${CONFIG.models[this.state.model].name} • ${this.state.effort}`;
    }

    handleInputKeydown(e) {
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        this.sendMessage();
      }

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
        const touch = e.touches[0];
        this.touchStartPos = { x: touch.clientX, y: touch.clientY };
        this.dragOffset = {
          x: touch.clientX - this.state.position.x,
          y: touch.clientY - this.state.position.y
        };
      } else {
        this.dragOffset = {
          x: e.clientX - this.state.position.x,
          y: e.clientY - this.state.position.y
        };
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
        case '/clear':
          this.clearChat();
          break;
        case '/reset':
          this.resetAll();
          break;
        case '/download':
          this.downloadChat();
          break;
        case '/help':
          this.showHelp();
          break;
        default:
          this.addMessage('system', `Unknown command: ${cmd}`);
      }

      this.elements.input.value = '';
    }

    ensureSystemPrompt() {
      if (this.systemPromptInjected) return;
      if (SYSTEM_PROMPT && typeof SYSTEM_PROMPT === 'string' && SYSTEM_PROMPT.trim().length > 0) {
        this.currentChat.unshift({ role: 'system', content: SYSTEM_PROMPT.trim() });
        this.systemPromptInjected = true;
      }
    }

    async sendMessage() {
      const message = this.elements.input.value.trim();
      if (!message && this.attachedImages.length === 0) return;

      if (!this.state.apiKey) {
        this.addMessage('system', 'Please enter your OpenAI API key first.');
        return;
      }

      // Ensure system prompt is present
      this.ensureSystemPrompt();

      // Add user message
      const userMessage = { role: 'user', content: message };

      // Add images if attached
      if (this.attachedImages.length > 0) {
        userMessage.content = [
          { type: 'text', text: message },
          ...this.attachedImages.map((img) => ({
            type: 'image_url',
            image_url: { url: img }
          }))
        ];
      }

      this.currentChat.push(userMessage);
      this.addMessage('user', message, this.attachedImages);
      this.elements.input.value = '';
      this.clearAttachedImages();

      // Assistant message placeholder
      const assistantMsgId = this.addMessage('assistant', '', [], true);

      try {
        await this.streamCompletion(assistantMsgId);
      } catch (error) {
        this.updateMessage(assistantMsgId, `Error: ${error.message}`);
      }
    }

    async streamCompletion(messageId) {
      this.abortController = new AbortController();

      const body = {
        model: this.state.model,
        messages: this.currentChat,
        stream: true,
        reasoning_effort: this.state.effort // use reasoning_effort instead of temperature/top_p
      };

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.state.apiKey}`
        },
        body: JSON.stringify(body),
        signal: this.abortController.signal
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`API Error: ${response.status} ${response.statusText} ${text ? `- ${text}` : ''}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';

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
            // ignore malformed chunks
          }
        }
      }

      this.currentChat.push({ role: 'assistant', content: fullContent });
      await this.saveChatToHistory();

      // Replace streaming placeholder actions with copy/retry
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
      const messageId = `msg-${Date.now()}`;
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
        contentDiv.innerHTML = this.formatMessage(content);
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
          const index = parseInt(e.target.dataset.index);
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

      const transaction = this.db.transaction([CONFIG.storeName], 'readwrite');
      const store = transaction.objectStore(CONFIG.storeName);

      const chatData = {
        timestamp: Date.now(),
        messages: this.currentChat,
        model: this.state.model
      };

      await store.add(chatData);
      this.loadChatHistory();
    }

    async loadChatHistory() {
      if (!this.db) return;

      const transaction = this.db.transaction([CONFIG.storeName], 'readonly');
      const store = transaction.objectStore(CONFIG.storeName);
      const index = store.index('timestamp');

      const chats = [];
      const cursor = index.openCursor(null, 'prev');

      cursor.onsuccess = (event) => {
        const c = event.target.result;
        if (c && chats.length < 30) {
          chats.push(c.value);
          c.continue();
        } else {
          this.renderChatHistory(chats);
        }
      };
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

      const transaction = this.db.transaction([CONFIG.storeName], 'readonly');
      const store = transaction.objectStore(CONFIG.storeName);
      const request = store.get(parseInt(chatId, 10));

      request.onsuccess = () => {
        const chat = request.result;
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
      const lines = [];
      lines.push(`# Khanware Chat Export`);
      lines.push('');
      lines.push(`Date: ${new Date().toLocaleString()}`);
      lines.push(`Model: ${this.state.model}`);
      lines.push(`Reasoning Effort: ${this.state.effort}`);
      if (SYSTEM_PROMPT) {
        lines.push('');
        lines.push(`System Prompt:`);
        lines.push('');
        lines.push('```');
        lines.push(SYSTEM_PROMPT);
        lines.push('```');
      }
      lines.push('');
      lines.push('---');
      lines.push('');

      this.currentChat.forEach((msg) => {
        if (msg.role === 'user') {
          lines.push(`## User`);
          lines.push(typeof msg.content === 'string' ? msg.content : (msg.content?.[0]?.text || '[image]'));
          lines.push('');
        } else if (msg.role === 'assistant') {
          lines.push(`## Assistant`);
          lines.push(typeof msg.content === 'string' ? msg.content : (msg.content?.[0]?.text || ''));
          lines.push('');
        }
      });

      const markdown = lines.join('\n');
      const blob = new Blob([markdown], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `khanware-chat-${Date.now()}.md`;
      a.click();
      URL.revokeObjectURL(url);
    }

    copyMessage(button) {
      const content = button.closest(`.${CONFIG.namespace}-message-content`).textContent;
      navigator.clipboard.writeText(content).then(() => {
        button.textContent = '✓';
        setTimeout(() => (button.textContent = '📋'), 1500);
      });
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
        localStorage.removeItem(`${CONFIG.namespace}_state`);
        indexedDB.deleteDatabase(CONFIG.dbName);
        this.destroy();
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

Tip: Click any image on the page to attach it to your message.
`;
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
      this.elements.input.focus();
    }

    hide() {
      this.state.visible = false;
      this.host.classList.remove('visible');
      this.saveState();
    }

    destroy() {
      document.removeEventListener('keydown', this.handleGlobalKeydown);
      document.removeEventListener('click', this.handleImageClick);
      document.removeEventListener('mousemove', this.handleMouseMove);
      document.removeEventListener('mouseup', this.handleMouseUp);
      document.removeEventListener('touchmove', this.handleMouseMove);
      document.removeEventListener('touchend', this.handleMouseUp);

      if (this.abortController) this.abortController.abort();
      if (this.db) this.db.close();

      if (this.host) this.host.remove();
      if (this.mobileToggleBtn) this.mobileToggleBtn.remove();
      document.getElementById(`${CONFIG.namespace}-styles`)?.remove();

      window.__khanware_instance = null;
      window.__khanware_loaded = false;
    }
  }

  // Initialize Khanware
  window.__khanware_instance = new KhanwareChat();

  // Global unload function
  window.__khanware_unload = function () {
    if (window.__khanware_instance) {
      window.__khanware_instance.destroy();
    }
  };
})();
