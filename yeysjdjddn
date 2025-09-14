// Khanware.js - Advanced Chat Overlay System
(function() {
  'use strict';

  // Check if already loaded
  if (window.__khanware_loaded) {
    console.log('Khanware already loaded');
    return;
  }
  window.__khanware_loaded = true;

  // Configuration and State Management
  const CONFIG = {
    namespace: 'khanware',
    dbName: 'KhanwareDB',
    dbVersion: 1,
    storeName: 'chats',
    defaultModel: 'gpt-3.5-turbo',
    models: {
      'gpt-3.5-turbo': { name: 'GPT-3.5 Turbo', maxTokens: 4096 },
      'gpt-4': { name: 'GPT-4', maxTokens: 8192 },
      'gpt-4-turbo-preview': { name: 'GPT-4 Turbo', maxTokens: 128000 }
    },
    thinkingEffort: {
      low: { temperature: 0.3, top_p: 0.5 },
      medium: { temperature: 0.7, top_p: 0.8 },
      high: { temperature: 1.0, top_p: 1.0 }
    }
  };

  class KhanwareChat {
    constructor() {
      this.state = this.loadState();
      this.currentChat = [];
      this.attachedImages = [];
      this.db = null;
      this.abortController = null;
      this.isDragging = false;
      this.isResizing = false;
      this.dragOffset = { x: 0, y: 0 };
      this.touchStartPos = { x: 0, y: 0 };
      
      this.init();
    }

    loadState() {
      const saved = localStorage.getItem(`${CONFIG.namespace}_state`);
      return saved ? JSON.parse(saved) : {
        visible: false,
        theme: 'dark',
        position: { x: window.innerWidth - 420, y: 20 },
        size: { width: 400, height: 600 },
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
      
      if (this.state.visible) {
        this.show();
      }
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
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          box-shadow: 0 8px 32px rgba(0,0,0,0.2);
          border-radius: 12px;
          overflow: hidden;
          display: none;
          touch-action: none;
        }

        .${CONFIG.namespace}-overlay.visible {
          display: flex;
        }

        .${CONFIG.namespace}-container {
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
        }

        .${CONFIG.namespace}-header {
          padding: 12px 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          cursor: move;
          user-select: none;
          border-bottom: 1px solid var(--border-color);
          background: var(--header-bg);
          -webkit-touch-callout: none;
        }

        .${CONFIG.namespace}-title {
          font-weight: 600;
          font-size: 14px;
          color: var(--text-primary);
        }

        .${CONFIG.namespace}-controls {
          display: flex;
          gap: 8px;
        }

        .${CONFIG.namespace}-btn {
          padding: 6px 12px;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 13px;
          transition: all 0.2s;
          background: var(--btn-bg);
          color: var(--text-primary);
        }

        .${CONFIG.namespace}-btn:hover {
          background: var(--btn-hover);
        }

        .${CONFIG.namespace}-btn:active {
          transform: scale(0.95);
        }

        .${CONFIG.namespace}-icon-btn {
          width: 28px;
          height: 28px;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .${CONFIG.namespace}-body {
          flex: 1;
          display: flex;
          background: var(--bg-primary);
          overflow: hidden;
        }

        .${CONFIG.namespace}-sidebar {
          width: 200px;
          border-right: 1px solid var(--border-color);
          display: flex;
          flex-direction: column;
          background: var(--sidebar-bg);
        }

        .${CONFIG.namespace}-main {
          flex: 1;
          display: flex;
          flex-direction: column;
        }

        .${CONFIG.namespace}-settings {
          padding: 12px;
          border-bottom: 1px solid var(--border-color);
          background: var(--settings-bg);
        }

        .${CONFIG.namespace}-input-group {
          margin-bottom: 8px;
        }

        .${CONFIG.namespace}-label {
          display: block;
          font-size: 12px;
          margin-bottom: 4px;
          color: var(--text-secondary);
        }

        .${CONFIG.namespace}-input,
        .${CONFIG.namespace}-select {
          width: 100%;
          padding: 6px 8px;
          border: 1px solid var(--border-color);
          border-radius: 4px;
          font-size: 13px;
          background: var(--input-bg);
          color: var(--text-primary);
        }

        .${CONFIG.namespace}-messages {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .${CONFIG.namespace}-message {
          display: flex;
          gap: 12px;
          animation: fadeIn 0.3s ease;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .${CONFIG.namespace}-avatar {
          width: 32px;
          height: 32px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          font-weight: 600;
          flex-shrink: 0;
        }

        .${CONFIG.namespace}-avatar.user {
          background: var(--user-avatar);
          color: white;
        }

        .${CONFIG.namespace}-avatar.assistant {
          background: var(--assistant-avatar);
          color: white;
        }

        .${CONFIG.namespace}-message-content {
          flex: 1;
          padding: 8px 12px;
          border-radius: 8px;
          background: var(--message-bg);
          color: var(--text-primary);
          font-size: 14px;
          line-height: 1.5;
          word-wrap: break-word;
        }

        .${CONFIG.namespace}-message-content pre {
          background: var(--code-bg);
          padding: 8px;
          border-radius: 4px;
          overflow-x: auto;
        }

        .${CONFIG.namespace}-message-content code {
          background: var(--code-bg);
          padding: 2px 4px;
          border-radius: 3px;
          font-size: 13px;
        }

        .${CONFIG.namespace}-message-actions {
          display: flex;
          gap: 4px;
          margin-top: 4px;
        }

        .${CONFIG.namespace}-input-area {
          padding: 12px;
          border-top: 1px solid var(--border-color);
          background: var(--input-area-bg);
        }

        .${CONFIG.namespace}-textarea {
          width: 100%;
          min-height: 60px;
          max-height: 120px;
          padding: 8px;
          border: 1px solid var(--border-color);
          border-radius: 6px;
          resize: vertical;
          font-size: 14px;
          font-family: inherit;
          background: var(--input-bg);
          color: var(--text-primary);
        }

        .${CONFIG.namespace}-input-controls {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 8px;
        }

        .${CONFIG.namespace}-attached-images {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .${CONFIG.namespace}-attached-image {
          position: relative;
          width: 60px;
          height: 60px;
          border-radius: 4px;
          overflow: hidden;
          border: 2px solid var(--border-color);
        }

        .${CONFIG.namespace}-attached-image img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .${CONFIG.namespace}-remove-image {
          position: absolute;
          top: 2px;
          right: 2px;
          width: 20px;
          height: 20px;
          background: rgba(0,0,0,0.7);
          color: white;
          border: none;
          border-radius: 50%;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
        }

        .${CONFIG.namespace}-history {
          flex: 1;
          overflow-y: auto;
          padding: 8px;
        }

        .${CONFIG.namespace}-history-item {
          padding: 8px;
          margin-bottom: 4px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 13px;
          background: var(--history-item-bg);
          color: var(--text-secondary);
          transition: all 0.2s;
        }

        .${CONFIG.namespace}-history-item:hover {
          background: var(--history-item-hover);
          color: var(--text-primary);
        }

        .${CONFIG.namespace}-token-info {
          font-size: 11px;
          color: var(--text-secondary);
          padding: 4px 8px;
          background: var(--token-bg);
          border-radius: 4px;
        }

        .${CONFIG.namespace}-resize-handle {
          position: absolute;
          bottom: 0;
          right: 0;
          width: 20px;
          height: 20px;
          cursor: nwse-resize;
          background: linear-gradient(135deg, transparent 50%, var(--border-color) 50%);
        }

        .${CONFIG.namespace}-loading {
          display: inline-block;
          width: 12px;
          height: 12px;
          border: 2px solid var(--border-color);
          border-top-color: var(--text-primary);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        /* Theme Variables */
        .${CONFIG.namespace}-overlay[data-theme="dark"] {
          --bg-primary: #1e1e1e;
          --header-bg: #2d2d2d;
          --sidebar-bg: #252525;
          --settings-bg: #2a2a2a;
          --input-area-bg: #2a2a2a;
          --message-bg: #2d2d2d;
          --input-bg: #1a1a1a;
          --code-bg: #1a1a1a;
          --btn-bg: #3a3a3a;
          --btn-hover: #4a4a4a;
          --border-color: #404040;
          --text-primary: #e0e0e0;
          --text-secondary: #a0a0a0;
          --user-avatar: #5865f2;
          --assistant-avatar: #10a37f;
          --history-item-bg: #2a2a2a;
          --history-item-hover: #3a3a3a;
          --token-bg: #2a2a2a;
        }

        .${CONFIG.namespace}-overlay[data-theme="light"] {
          --bg-primary: #ffffff;
          --header-bg: #f7f7f7;
          --sidebar-bg: #fafafa;
          --settings-bg: #f5f5f5;
          --input-area-bg: #f5f5f5;
          --message-bg: #f0f0f0;
          --input-bg: #ffffff;
          --code-bg: #f5f5f5;
          --btn-bg: #e0e0e0;
          --btn-hover: #d0d0d0;
          --border-color: #d0d0d0;
          --text-primary: #1a1a1a;
          --text-secondary: #666666;
          --user-avatar: #5865f2;
          --assistant-avatar: #10a37f;
          --history-item-bg: #f0f0f0;
          --history-item-hover: #e0e0e0;
          --token-bg: #f0f0f0;
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

          .${CONFIG.namespace}-sidebar {
            display: none;
          }

          .${CONFIG.namespace}-header {
            padding: 16px;
          }

          .${CONFIG.namespace}-resize-handle {
            display: none;
          }
        }
      `;
      document.head.appendChild(style);
    }

    createOverlay() {
      // Create Shadow DOM host
      this.host = document.createElement('div');
      this.host.className = `${CONFIG.namespace}-overlay ${this.state.visible ? 'visible' : ''}`;
      this.host.setAttribute('data-theme', this.state.theme);
      this.host.style.left = `${this.state.position.x}px`;
      this.host.style.top = `${this.state.position.y}px`;
      this.host.style.width = `${this.state.size.width}px`;
      this.host.style.height = `${this.state.size.height}px`;

      // Create Shadow Root
      this.shadowRoot = this.host.attachShadow({ mode: 'open' });

      // Clone styles into shadow DOM
      const styleClone = document.getElementById(`${CONFIG.namespace}-styles`).cloneNode(true);
      this.shadowRoot.appendChild(styleClone);

      // Create main container
      const container = document.createElement('div');
      container.className = `${CONFIG.namespace}-container`;
      container.innerHTML = `
        <div class="${CONFIG.namespace}-header">
          <div class="${CONFIG.namespace}-title">Khanware Chat</div>
          <div class="${CONFIG.namespace}-controls">
            <button class="${CONFIG.namespace}-btn ${CONFIG.namespace}-icon-btn" data-action="theme">🌓</button>
            <button class="${CONFIG.namespace}-btn ${CONFIG.namespace}-icon-btn" data-action="minimize">−</button>
            <button class="${CONFIG.namespace}-btn ${CONFIG.namespace}-icon-btn" data-action="close">×</button>
          </div>
        </div>
        <div class="${CONFIG.namespace}-body">
          <div class="${CONFIG.namespace}-sidebar">
            <div class="${CONFIG.namespace}-settings">
              <div class="${CONFIG.namespace}-input-group">
                <label class="${CONFIG.namespace}-label">API Key</label>
                <input type="password" class="${CONFIG.namespace}-input" id="api-key" 
                       placeholder="sk-..." value="${this.state.apiKey}">
              </div>
              <div class="${CONFIG.namespace}-input-group">
                <label class="${CONFIG.namespace}-label">Model</label>
                <select class="${CONFIG.namespace}-select" id="model-select">
                  ${Object.entries(CONFIG.models).map(([key, model]) => `
                    <option value="${key}" ${key === this.state.model ? 'selected' : ''}>
                      ${model.name}
                    </option>
                  `).join('')}
                </select>
              </div>
              <div class="${CONFIG.namespace}-input-group">
                <label class="${CONFIG.namespace}-label">Thinking Effort</label>
                <select class="${CONFIG.namespace}-select" id="effort-select">
                  <option value="low" ${this.state.effort === 'low' ? 'selected' : ''}>Low</option>
                  <option value="medium" ${this.state.effort === 'medium' ? 'selected' : ''}>Medium</option>
                  <option value="high" ${this.state.effort === 'high' ? 'selected' : ''}>High</option>
                </select>
              </div>
              <button class="${CONFIG.namespace}-btn" data-action="export" style="width: 100%; margin-top: 8px;">
                📥 Export to Markdown
              </button>
            </div>
            <div class="${CONFIG.namespace}-history" id="chat-history"></div>
          </div>
          <div class="${CONFIG.namespace}-main">
            <div class="${CONFIG.namespace}-messages" id="messages"></div>
            <div class="${CONFIG.namespace}-input-area">
              <div class="${CONFIG.namespace}-attached-images" id="attached-images"></div>
              <textarea class="${CONFIG.namespace}-textarea" id="message-input" 
                        placeholder="Type a message... (Ctrl+Enter to send, /help for commands)"></textarea>
              <div class="${CONFIG.namespace}-input-controls">
                <div class="${CONFIG.namespace}-token-info" id="token-info">Tokens: 0</div>
                <button class="${CONFIG.namespace}-btn" data-action="send">Send</button>
              </div>
            </div>
          </div>
        </div>
        <div class="${CONFIG.namespace}-resize-handle"></div>
      `;

      this.shadowRoot.appendChild(container);
      document.body.appendChild(this.host);

      // Store references
      this.elements = {
        messages: this.shadowRoot.getElementById('messages'),
        input: this.shadowRoot.getElementById('message-input'),
        apiKey: this.shadowRoot.getElementById('api-key'),
        modelSelect: this.shadowRoot.getElementById('model-select'),
        effortSelect: this.shadowRoot.getElementById('effort-select'),
        tokenInfo: this.shadowRoot.getElementById('token-info'),
        attachedImages: this.shadowRoot.getElementById('attached-images'),
        chatHistory: this.shadowRoot.getElementById('chat-history'),
        header: this.shadowRoot.querySelector(`.${CONFIG.namespace}-header`),
        resizeHandle: this.shadowRoot.querySelector(`.${CONFIG.namespace}-resize-handle`)
      };
    }

    attachEventListeners() {
      // Global keyboard shortcuts
      document.addEventListener('keydown', this.handleGlobalKeydown.bind(this));

      // Shadow DOM event delegation
      this.shadowRoot.addEventListener('click', this.handleClick.bind(this));
      this.shadowRoot.addEventListener('change', this.handleChange.bind(this));

      // Drag and resize
      this.elements.header.addEventListener('mousedown', this.startDrag.bind(this));
      this.elements.header.addEventListener('touchstart', this.startDrag.bind(this), { passive: false });
      
      this.elements.resizeHandle.addEventListener('mousedown', this.startResize.bind(this));
      this.elements.resizeHandle.addEventListener('touchstart', this.startResize.bind(this), { passive: false });

      // Input events
      this.elements.input.addEventListener('keydown', this.handleInputKeydown.bind(this));

      // Image click listener for the main page
      document.addEventListener('click', this.handleImageClick.bind(this));

      // Mobile touch events
      document.addEventListener('mousemove', this.handleMouseMove.bind(this));
      document.addEventListener('mouseup', this.handleMouseUp.bind(this));
      document.addEventListener('touchmove', this.handleMouseMove.bind(this), { passive: false });
      document.addEventListener('touchend', this.handleMouseUp.bind(this));
    }

    handleGlobalKeydown(e) {
      // Toggle with G key
      if (e.key === 'g' || e.key === 'G') {
        if (!e.target.matches('input, textarea')) {
          this.toggle();
        }
      }

      // Close with Escape
      if (e.key === 'Escape' && this.state.visible) {
        this.hide();
      }
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
          this.retryMessage(e.target);
          break;
        case 'export':
          this.exportToMarkdown();
          break;
      }
    }

    handleChange(e) {
      if (e.target.id === 'api-key') {
        this.state.apiKey = e.target.value;
        this.saveState();
      } else if (e.target.id === 'model-select') {
        this.state.model = e.target.value;
        this.saveState();
      } else if (e.target.id === 'effort-select') {
        this.state.effort = e.target.value;
        this.saveState();
      }
    }

    handleInputKeydown(e) {
      // Send on Ctrl+Enter
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        this.sendMessage();
      }

      // Command detection
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
      if (e.type === 'touchstart') {
        e.preventDefault();
      }
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
        
        this.state.size.width = Math.max(300, clientX - this.state.position.x);
        this.state.size.height = Math.max(400, clientY - this.state.position.y);
        
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

    async sendMessage() {
      const message = this.elements.input.value.trim();
      if (!message && this.attachedImages.length === 0) return;

      if (!this.state.apiKey) {
        this.addMessage('system', 'Please enter your OpenAI API key first.');
        return;
      }

      // Add user message
      const userMessage = { role: 'user', content: message };
      
      // Add images if attached
      if (this.attachedImages.length > 0) {
        userMessage.content = [
          { type: 'text', text: message },
          ...this.attachedImages.map(img => ({
            type: 'image_url',
            image_url: { url: img }
          }))
        ];
      }

      this.currentChat.push(userMessage);
      this.addMessage('user', message, this.attachedImages);
      this.elements.input.value = '';
      this.clearAttachedImages();

      // Create assistant message placeholder
      const assistantMsgId = this.addMessage('assistant', '', [], true);

      try {
        await this.streamCompletion(assistantMsgId);
      } catch (error) {
        this.updateMessage(assistantMsgId, `Error: ${error.message}`);
      }
    }

    async streamCompletion(messageId) {
      const effortSettings = CONFIG.thinkingEffort[this.state.effort];
      
      this.abortController = new AbortController();
      
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.state.apiKey}`
        },
        body: JSON.stringify({
          model: this.state.model,
          messages: this.currentChat,
          stream: true,
          ...effortSettings
        }),
        signal: this.abortController.signal
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';
      let totalTokens = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                fullContent += content;
                this.updateMessage(messageId, fullContent);
              }
              
              if (parsed.usage) {
                totalTokens = parsed.usage.total_tokens;
                this.updateTokenInfo(totalTokens);
              }
            } catch (e) {
              console.error('Parse error:', e);
            }
          }
        }
      }

      // Add to chat history
      this.currentChat.push({ role: 'assistant', content: fullContent });
      await this.saveChatToHistory();
    }

    addMessage(role, content, images = [], isStreaming = false) {
      const messageId = `msg-${Date.now()}`;
      const messageDiv = document.createElement('div');
      messageDiv.className = `${CONFIG.namespace}-message`;
      messageDiv.id = messageId;

      const avatarDiv = document.createElement('div');
      avatarDiv.className = `${CONFIG.namespace}-avatar ${role}`;
      avatarDiv.textContent = role === 'user' ? 'U' : role === 'assistant' ? 'A' : 'S';

      const contentDiv = document.createElement('div');
      contentDiv.className = `${CONFIG.namespace}-message-content`;
      
      // Add images if present
      if (images.length > 0) {
        const imagesHtml = images.map(img => `<img src="${img}" style="max-width: 200px; margin: 4px; border-radius: 4px;">`).join('');
        contentDiv.innerHTML = imagesHtml + '<br>';
      }
      
      if (isStreaming) {
        contentDiv.innerHTML += `<span class="${CONFIG.namespace}-loading"></span>`;
      } else {
        contentDiv.innerHTML += this.formatMessage(content);
      }

      // Add action buttons
      if (role === 'assistant' && !isStreaming) {
        const actionsDiv = document.createElement('div');
        actionsDiv.className = `${CONFIG.namespace}-message-actions`;
        actionsDiv.innerHTML = `
          <button class="${CONFIG.namespace}-btn ${CONFIG.namespace}-icon-btn" data-action="copy" title="Copy">📋</button>
          <button class="${CONFIG.namespace}-btn ${CONFIG.namespace}-icon-btn" data-action="retry" title="Retry">🔄</button>
        `;
        contentDiv.appendChild(actionsDiv);
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
      // Basic markdown formatting
      return content
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
      this.elements.attachedImages.innerHTML = this.attachedImages.map((img, index) => `
        <div class="${CONFIG.namespace}-attached-image">
          <img src="${img}" alt="Attached ${index + 1}">
          <button class="${CONFIG.namespace}-remove-image" data-index="${index}">×</button>
        </div>
      `).join('');

      // Add remove handlers
      this.shadowRoot.querySelectorAll(`.${CONFIG.namespace}-remove-image`).forEach(btn => {
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

    updateTokenInfo(tokens) {
      this.elements.tokenInfo.textContent = `Tokens: ${tokens}`;
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
        const cursor = event.target.result;
        if (cursor && chats.length < 20) {
          chats.push(cursor.value);
          cursor.continue();
        } else {
          this.renderChatHistory(chats);
        }
      };
    }

    renderChatHistory(chats) {
      this.elements.chatHistory.innerHTML = chats.map(chat => {
        const date = new Date(chat.timestamp);
        const preview = chat.messages[0]?.content || 'Empty chat';
        const previewText = typeof preview === 'string' ? preview : preview[0]?.text || 'Image';
        
        return `
          <div class="${CONFIG.namespace}-history-item" data-id="${chat.id}">
            <div style="font-weight: 500;">${date.toLocaleDateString()}</div>
            <div style="font-size: 11px; margin-top: 2px;">
              ${previewText.substring(0, 50)}${previewText.length > 50 ? '...' : ''}
            </div>
          </div>
        `;
      }).join('');

      // Add click handlers
      this.shadowRoot.querySelectorAll(`.${CONFIG.namespace}-history-item`).forEach(item => {
        item.addEventListener('click', () => this.loadChat(item.dataset.id));
      });
    }

    async loadChat(chatId) {
      if (!this.db) return;

      const transaction = this.db.transaction([CONFIG.storeName], 'readonly');
      const store = transaction.objectStore(CONFIG.storeName);
      const request = store.get(parseInt(chatId));

      request.onsuccess = () => {
        const chat = request.result;
        if (chat) {
          this.currentChat = chat.messages;
          this.elements.messages.innerHTML = '';
          
          chat.messages.forEach(msg => {
            if (msg.role !== 'system') {
              const content = typeof msg.content === 'string' ? msg.content : msg.content[0]?.text || '';
              this.addMessage(msg.role, content);
            }
          });
        }
      };
    }

    exportToMarkdown() {
      let markdown = `# Khanware Chat Export\n\n`;
      markdown += `**Date:** ${new Date().toLocaleString()}\n`;
      markdown += `**Model:** ${this.state.model}\n\n`;
      markdown += `---\n\n`;

      this.currentChat.forEach(msg => {
        if (msg.role === 'user') {
          markdown += `### User\n${msg.content}\n\n`;
        } else if (msg.role === 'assistant') {
          markdown += `### Assistant\n${msg.content}\n\n`;
        }
      });

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
        setTimeout(() => button.textContent = '📋', 2000);
      });
    }

    retryMessage() {
      if (this.currentChat.length > 0) {
        // Remove last assistant message
        if (this.currentChat[this.currentChat.length - 1].role === 'assistant') {
          this.currentChat.pop();
        }
        
        // Remove from UI
        const messages = this.shadowRoot.querySelectorAll(`.${CONFIG.namespace}-message`);
        if (messages.length > 0) {
          messages[messages.length - 1].remove();
        }
        
        // Resend
        this.sendMessage();
      }
    }

    clearChat() {
      this.currentChat = [];
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
        /clear - Clear current chat
        /reset - Reset all data
        /download - Download chat as JSON
        /help - Show this help
        
        Shortcuts:
        G - Toggle chat window
        Esc - Close chat
        Ctrl+Enter - Send message
        
        Click any image on the page to attach it to your message.
      `;
      this.addMessage('system', helpText);
    }

    toggleTheme() {
      this.state.theme = this.state.theme === 'dark' ? 'light' : 'dark';
      this.host.setAttribute('data-theme', this.state.theme);
      this.saveState();
    }

    toggle() {
      if (this.state.visible) {
        this.hide();
      } else {
        this.show();
      }
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
      // Remove event listeners
      document.removeEventListener('keydown', this.handleGlobalKeydown);
      document.removeEventListener('click', this.handleImageClick);
      document.removeEventListener('mousemove', this.handleMouseMove);
      document.removeEventListener('mouseup', this.handleMouseUp);
      document.removeEventListener('touchmove', this.handleMouseMove);
      document.removeEventListener('touchend', this.handleMouseUp);

      // Abort any ongoing requests
      if (this.abortController) {
        this.abortController.abort();
      }

      // Close database
      if (this.db) {
        this.db.close();
      }

      // Remove DOM elements
      this.host.remove();
      document.getElementById(`${CONFIG.namespace}-styles`)?.remove();

      // Clear references
      window.__khanware_instance = null;
      window.__khanware_loaded = false;
    }
  }

  // Initialize Khanware
  window.__khanware_instance = new KhanwareChat();

  // Global unload function
  window.__khanware_unload = function() {
    if (window.__khanware_instance) {
      window.__khanware_instance.destroy();
    }
  };

  console.log('Khanware loaded successfully! Press G to toggle the chat.');
})();
