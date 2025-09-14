// Khanware.js - Advanced Chat Overlay System v2.0
(function() {
  'use strict';

  // ======================== CONFIGURATION ========================
  // OpenAI API Key - Replace with your actual API key
  const OPENAI_API_KEY = '';  // Example: 'sk-...'

  // System Prompt - Customize the assistant's behavior
  const SYSTEM_PROMPT = `You are a helpful AI assistant. Provide clear, accurate, and concise responses. 
Be friendly and professional in your interactions.`;

  // ===============================================================

  // Check if already loaded
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
    defaultModel: 'gpt-5-mini',
    models: {
      'gpt-5-mini': { name: 'GPT-5 Mini', description: 'Faster, efficient responses' },
      'gpt-5': { name: 'GPT-5', description: 'Advanced reasoning capabilities' }
    },
    reasoningEffort: {
      low: 'Low - Quick responses',
      medium: 'Medium - Balanced thinking',
      high: 'High - Deep reasoning'
    }
  };

  class KhanwareChat {
    constructor() {
      this.state = this.loadState();
      this.currentChat = [{
        role: 'system',
        content: SYSTEM_PROMPT
      }];
      this.attachedImages = [];
      this.db = null;
      this.abortController = null;
      this.isDragging = false;
      this.isResizing = false;
      this.dragOffset = { x: 0, y: 0 };
      
      // Set API key from configuration
      if (OPENAI_API_KEY) {
        this.state.apiKey = OPENAI_API_KEY;
      }
      
      this.init();
    }

    loadState() {
      const saved = localStorage.getItem(`${CONFIG.namespace}_state`);
      return saved ? JSON.parse(saved) : {
        visible: false,
        theme: 'dark',
        position: { x: 20, y: 20 },
        size: { width: 400, height: 600 },
        apiKey: '',
        model: CONFIG.defaultModel,
        reasoning: 'medium',
        chatHistory: []
      };
    }

    saveState() {
      localStorage.setItem(`${CONFIG.namespace}_state`, JSON.stringify(this.state));
    }

    async init() {
      await this.initDB();
      this.createStyles();
      this.createFloatingButton();
      this.createOverlay();
      this.attachEventListeners();
      this.loadChatHistory();
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

    createFloatingButton() {
      // Create floating button for mobile devices
      this.floatingBtn = document.createElement('button');
      this.floatingBtn.className = `${CONFIG.namespace}-floating-btn`;
      this.floatingBtn.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
        </svg>
      `;
      document.body.appendChild(this.floatingBtn);

      this.floatingBtn.addEventListener('click', () => this.toggle());
    }

    createStyles() {
      const style = document.createElement('style');
      style.id = `${CONFIG.namespace}-styles`;
      style.textContent = `
        /* Floating Button */
        .${CONFIG.namespace}-floating-btn {
          position: fixed;
          bottom: 20px;
          right: 20px;
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
          cursor: pointer;
          z-index: 2147483646;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.3s, box-shadow 0.3s;
        }

        .${CONFIG.namespace}-floating-btn:hover {
          transform: scale(1.1);
          box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
        }

        .${CONFIG.namespace}-floating-btn:active {
          transform: scale(0.95);
        }

        /* Main Overlay */
        .${CONFIG.namespace}-overlay {
          position: fixed;
          z-index: 2147483647;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: var(--bg-primary);
          border-radius: 16px;
          overflow: hidden;
          display: none;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          border: 1px solid var(--border-color);
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

        /* Header */
        .${CONFIG.namespace}-header {
          padding: 16px 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          cursor: move;
          user-select: none;
          background: var(--header-bg);
          border-bottom: 1px solid var(--border-color);
        }

        .${CONFIG.namespace}-title {
          font-weight: 600;
          font-size: 16px;
          color: var(--text-primary);
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .${CONFIG.namespace}-title::before {
          content: "✨";
          font-size: 20px;
        }

        .${CONFIG.namespace}-controls {
          display: flex;
          gap: 8px;
        }

        /* Buttons */
        .${CONFIG.namespace}-btn {
          padding: 8px 16px;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.2s;
          background: var(--btn-bg);
          color: var(--text-primary);
        }

        .${CONFIG.namespace}-btn:hover {
          background: var(--btn-hover);
          transform: translateY(-1px);
        }

        .${CONFIG.namespace}-btn:active {
          transform: translateY(0);
        }

        .${CONFIG.namespace}-btn-primary {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }

        .${CONFIG.namespace}-btn-primary:hover {
          background: linear-gradient(135deg, #7c8ff0 0%, #8a5bb5 100%);
        }

        .${CONFIG.namespace}-icon-btn {
          width: 32px;
          height: 32px;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
        }

        /* Settings Panel */
        .${CONFIG.namespace}-settings {
          padding: 16px;
          background: var(--settings-bg);
          border-bottom: 1px solid var(--border-color);
        }

        .${CONFIG.namespace}-settings-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .${CONFIG.namespace}-input-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .${CONFIG.namespace}-input-group.full-width {
          grid-column: 1 / -1;
        }

        .${CONFIG.namespace}-label {
          font-size: 12px;
          font-weight: 500;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .${CONFIG.namespace}-input,
        .${CONFIG.namespace}-select {
          padding: 8px 12px;
          border: 2px solid var(--border-color);
          border-radius: 8px;
          font-size: 14px;
          background: var(--input-bg);
          color: var(--text-primary);
          transition: border-color 0.2s;
        }

        .${CONFIG.namespace}-input:focus,
        .${CONFIG.namespace}-select:focus {
          outline: none;
          border-color: #667eea;
        }

        /* Messages Area */
        .${CONFIG.namespace}-messages {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          background: var(--bg-primary);
        }

        .${CONFIG.namespace}-message {
          display: flex;
          gap: 12px;
          animation: slideIn 0.3s ease;
        }

        @keyframes slideIn {
          from { 
            opacity: 0; 
            transform: translateX(-20px);
          }
          to { 
            opacity: 1; 
            transform: translateX(0);
          }
        }

        .${CONFIG.namespace}-avatar {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          flex-shrink: 0;
        }

        .${CONFIG.namespace}-avatar.user {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }

        .${CONFIG.namespace}-avatar.assistant {
          background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
        }

        .${CONFIG.namespace}-avatar.system {
          background: linear-gradient(135deg, #ee9ca7 0%, #ffdde1 100%);
        }

        .${CONFIG.namespace}-message-content {
          flex: 1;
          padding: 12px 16px;
          border-radius: 12px;
          background: var(--message-bg);
          color: var(--text-primary);
          font-size: 14px;
          line-height: 1.6;
          word-wrap: break-word;
        }

        .${CONFIG.namespace}-message-content pre {
          background: var(--code-bg);
          padding: 12px;
          border-radius: 8px;
          overflow-x: auto;
          margin: 8px 0;
        }

        .${CONFIG.namespace}-message-content code {
          background: var(--code-bg);
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 13px;
          font-family: 'Monaco', 'Courier New', monospace;
        }

        /* Input Area */
        .${CONFIG.namespace}-input-area {
          padding: 16px;
          background: var(--input-area-bg);
          border-top: 1px solid var(--border-color);
        }

        .${CONFIG.namespace}-textarea {
          width: 100%;
          min-height: 80px;
          max-height: 150px;
          padding: 12px;
          border: 2px solid var(--border-color);
          border-radius: 12px;
          resize: vertical;
          font-size: 14px;
          font-family: inherit;
          background: var(--input-bg);
          color: var(--text-primary);
          transition: border-color 0.2s;
        }

        .${CONFIG.namespace}-textarea:focus {
          outline: none;
          border-color: #667eea;
        }

        .${CONFIG.namespace}-input-controls {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 12px;
        }

        .${CONFIG.namespace}-attached-images {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-bottom: 12px;
        }

        .${CONFIG.namespace}-attached-image {
          position: relative;
          width: 80px;
          height: 80px;
          border-radius: 8px;
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
          top: 4px;
          right: 4px;
          width: 24px;
          height: 24px;
          background: rgba(0, 0, 0, 0.8);
          color: white;
          border: none;
          border-radius: 50%;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
        }

        /* Resize Handle */
        .${CONFIG.namespace}-resize-handle {
          position: absolute;
          bottom: 0;
          right: 0;
          width: 20px;
          height: 20px;
          cursor: nwse-resize;
          background: transparent;
        }

        .${CONFIG.namespace}-resize-handle::after {
          content: "";
          position: absolute;
          bottom: 4px;
          right: 4px;
          width: 8px;
          height: 8px;
          border-right: 2px solid var(--border-color);
          border-bottom: 2px solid var(--border-color);
        }

        /* Loading Animation */
        .${CONFIG.namespace}-loading {
          display: inline-flex;
          gap: 4px;
        }

        .${CONFIG.namespace}-loading span {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--text-secondary);
          animation: bounce 1.4s infinite ease-in-out both;
        }

        .${CONFIG.namespace}-loading span:nth-child(1) {
          animation-delay: -0.32s;
        }

        .${CONFIG.namespace}-loading span:nth-child(2) {
          animation-delay: -0.16s;
        }

        @keyframes bounce {
          0%, 80%, 100% {
            transform: scale(0);
          }
          40% {
            transform: scale(1);
          }
        }

        /* Scrollbar */
        .${CONFIG.namespace}-messages::-webkit-scrollbar {
          width: 8px;
        }

        .${CONFIG.namespace}-messages::-webkit-scrollbar-track {
          background: var(--bg-primary);
        }

        .${CONFIG.namespace}-messages::-webkit-scrollbar-thumb {
          background: var(--border-color);
          border-radius: 4px;
        }

        .${CONFIG.namespace}-messages::-webkit-scrollbar-thumb:hover {
          background: var(--text-secondary);
        }

        /* Theme Variables */
        .${CONFIG.namespace}-overlay[data-theme="dark"] {
          --bg-primary: #1a1a1a;
          --header-bg: linear-gradient(135deg, #2a2a2a 0%, #1f1f1f 100%);
          --settings-bg: #242424;
          --input-area-bg: #242424;
          --message-bg: #2a2a2a;
          --input-bg: #1f1f1f;
          --code-bg: #0d0d0d;
          --btn-bg: #333333;
          --btn-hover: #404040;
          --border-color: #333333;
          --text-primary: #ffffff;
          --text-secondary: #999999;
        }

        .${CONFIG.namespace}-overlay[data-theme="light"] {
          --bg-primary: #ffffff;
          --header-bg: linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%);
          --settings-bg: #f8f9fa;
          --input-area-bg: #f8f9fa;
          --message-bg: #f0f2f5;
          --input-bg: #ffffff;
          --code-bg: #f8f9fa;
          --btn-bg: #e9ecef;
          --btn-hover: #dee2e6;
          --border-color: #dee2e6;
          --text-primary: #212529;
          --text-secondary: #6c757d;
        }

        /* Mobile Responsive */
        @media (max-width: 768px) {
          .${CONFIG.namespace}-overlay {
            width: 100% !important;
            height: 100% !important;
            top: 0 !important;
            left: 0 !important;
            border-radius: 0;
            max-width: none !important;
            max-height: none !important;
          }

          .${CONFIG.namespace}-resize-handle {
            display: none;
          }

          .${CONFIG.namespace}-settings-grid {
            grid-template-columns: 1fr;
          }

          .${CONFIG.namespace}-header {
            cursor: default;
          }
        }
      `;
      document.head.appendChild(style);
    }

    createOverlay() {
      this.overlay = document.createElement('div');
      this.overlay.className = `${CONFIG.namespace}-overlay`;
      this.overlay.setAttribute('data-theme', this.state.theme);
      this.overlay.style.left = `${this.state.position.x}px`;
      this.overlay.style.top = `${this.state.position.y}px`;
      this.overlay.style.width = `${this.state.size.width}px`;
      this.overlay.style.height = `${this.state.size.height}px`;

      this.overlay.innerHTML = `
        <div class="${CONFIG.namespace}-container">
          <div class="${CONFIG.namespace}-header">
            <div class="${CONFIG.namespace}-title">Khanware AI Assistant</div>
            <div class="${CONFIG.namespace}-controls">
              <button class="${CONFIG.namespace}-btn ${CONFIG.namespace}-icon-btn" data-action="theme" title="Toggle theme">
                🌓
              </button>
              <button class="${CONFIG.namespace}-btn ${CONFIG.namespace}-icon-btn" data-action="clear" title="Clear chat">
                🗑️
              </button>
              <button class="${CONFIG.namespace}-btn ${CONFIG.namespace}-icon-btn" data-action="close" title="Close">
                ✕
              </button>
            </div>
          </div>
          
          <div class="${CONFIG.namespace}-settings">
            <div class="${CONFIG.namespace}-settings-grid">
              <div class="${CONFIG.namespace}-input-group full-width">
                <label class="${CONFIG.namespace}-label">API Key</label>
                <input type="password" 
                       class="${CONFIG.namespace}-input" 
                       id="api-key" 
                       placeholder="Enter your OpenAI API key"
                       value="${this.state.apiKey}">
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
                <label class="${CONFIG.namespace}-label">Reasoning Effort</label>
                <select class="${CONFIG.namespace}-select" id="reasoning-select">
                  ${Object.entries(CONFIG.reasoningEffort).map(([key, label]) => `
                    <option value="${key}" ${key === this.state.reasoning ? 'selected' : ''}>
                      ${label}
                    </option>
                  `).join('')}
                </select>
              </div>
            </div>
          </div>
          
          <div class="${CONFIG.namespace}-messages" id="messages"></div>
          
          <div class="${CONFIG.namespace}-input-area">
            <div class="${CONFIG.namespace}-attached-images" id="attached-images"></div>
            <textarea class="${CONFIG.namespace}-textarea" 
                      id="message-input" 
                      placeholder="Type your message here... (Ctrl+Enter to send)"></textarea>
            <div class="${CONFIG.namespace}-input-controls">
              <button class="${CONFIG.namespace}-btn" data-action="attach">
                📎 Attach Image
              </button>
              <button class="${CONFIG.namespace}-btn ${CONFIG.namespace}-btn-primary" data-action="send">
                Send Message →
              </button>
            </div>
          </div>
        </div>
        <div class="${CONFIG.namespace}-resize-handle"></div>
      `;

      document.body.appendChild(this.overlay);

      // Store element references
      this.elements = {
        messages: this.overlay.querySelector('#messages'),
        input: this.overlay.querySelector('#message-input'),
        apiKey: this.overlay.querySelector('#api-key'),
        modelSelect: this.overlay.querySelector('#model-select'),
        reasoningSelect: this.overlay.querySelector('#reasoning-select'),
        attachedImages: this.overlay.querySelector('#attached-images'),
        header: this.overlay.querySelector(`.${CONFIG.namespace}-header`),
        resizeHandle: this.overlay.querySelector(`.${CONFIG.namespace}-resize-handle`)
      };
    }

    attachEventListeners() {
      // Keyboard shortcuts
      document.addEventListener('keydown', this.handleGlobalKeydown.bind(this));

      // Overlay events
      this.overlay.addEventListener('click', this.handleClick.bind(this));
      this.overlay.addEventListener('change', this.handleChange.bind(this));

      // Drag functionality
      if (!this.isMobile()) {
        this.elements.header.addEventListener('mousedown', this.startDrag.bind(this));
        this.elements.resizeHandle.addEventListener('mousedown', this.startResize.bind(this));
        document.addEventListener('mousemove', this.handleMouseMove.bind(this));
        document.addEventListener('mouseup', this.handleMouseUp.bind(this));
      }

      // Input events
      this.elements.input.addEventListener('keydown', this.handleInputKeydown.bind(this));

      // Image attachment
      document.addEventListener('click', this.handleImageClick.bind(this));
    }

    handleGlobalKeydown(e) {
      // Toggle with Alt+K
      if (e.altKey && e.key === 'k') {
        e.preventDefault();
        this.toggle();
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
        case 'clear':
          this.clearChat();
          break;
        case 'close':
          this.hide();
          break;
        case 'send':
          this.sendMessage();
          break;
        case 'attach':
          this.promptImageAttachment();
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
      } else if (e.target.id === 'reasoning-select') {
        this.state.reasoning = e.target.value;
        this.saveState();
      }
    }

    handleInputKeydown(e) {
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        this.sendMessage();
      }
    }

    handleImageClick(e) {
      if (e.target.tagName === 'IMG' && 
          this.state.visible && 
          !e.target.closest(`.${CONFIG.namespace}-overlay`)) {
        e.preventDefault();
        e.stopPropagation();
        this.attachImage(e.target);
      }
    }

    startDrag(e) {
      this.isDragging = true;
      this.dragOffset = {
        x: e.clientX - this.state.position.x,
        y: e.clientY - this.state.position.y
      };
    }

    startResize(e) {
      this.isResizing = true;
      e.preventDefault();
    }

    handleMouseMove(e) {
      if (this.isDragging) {
        this.state.position.x = e.clientX - this.dragOffset.x;
        this.state.position.y = e.clientY - this.dragOffset.y;
        this.overlay.style.left = `${this.state.position.x}px`;
        this.overlay.style.top = `${this.state.position.y}px`;
      }

      if (this.isResizing) {
        this.state.size.width = Math.max(350, e.clientX - this.state.position.x);
        this.state.size.height = Math.max(400, e.clientY - this.state.position.y);
        this.overlay.style.width = `${this.state.size.width}px`;
        this.overlay.style.height = `${this.state.size.height}px`;
      }
    }

    handleMouseUp() {
      if (this.isDragging || this.isResizing) {
        this.isDragging = false;
        this.isResizing = false;
        this.saveState();
      }
    }

    async sendMessage() {
      const message = this.elements.input.value.trim();
      if (!message && this.attachedImages.length === 0) return;

      if (!this.state.apiKey) {
        this.addMessage('system', '⚠️ Please enter your OpenAI API key first.');
        return;
      }

      // Add user message
      const userMessage = { role: 'user', content: message };
      
      // Handle attached images
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
        this.updateMessage(assistantMsgId, `❌ Error: ${error.message}`);
      }
    }

    async streamCompletion(messageId) {
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
          reasoning_effort: this.state.reasoning
        }),
        signal: this.abortController.signal
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`API Error: ${response.status} - ${error}`);
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
      const messageId = `msg-${Date.now()}-${Math.random()}`;
      const messageDiv = document.createElement('div');
      messageDiv.className = `${CONFIG.namespace}-message`;
      messageDiv.id = messageId;

      const avatarDiv = document.createElement('div');
      avatarDiv.className = `${CONFIG.namespace}-avatar ${role}`;
      avatarDiv.innerHTML = role === 'user' ? '👤' : role === 'assistant' ? '🤖' : 'ℹ️';

      const contentDiv = document.createElement('div');
      contentDiv.className = `${CONFIG.namespace}-message-content`;
      
      // Add images if present
      if (images.length > 0) {
        const imagesHtml = images.map(img => 
          `<img src="${img}" style="max-width: 100%; margin: 8px 0; border-radius: 8px;">`
        ).join('');
        contentDiv.innerHTML = imagesHtml;
      }
      
      if (isStreaming) {
        contentDiv.innerHTML += `
          <div class="${CONFIG.namespace}-loading">
            <span></span>
            <span></span>
            <span></span>
          </div>
        `;
      } else {
        contentDiv.innerHTML += this.formatMessage(content);
      }

      messageDiv.appendChild(avatarDiv);
      messageDiv.appendChild(contentDiv);
      this.elements.messages.appendChild(messageDiv);
      this.elements.messages.scrollTop = this.elements.messages.scrollHeight;

      return messageId;
    }

    updateMessage(messageId, content) {
      const message = this.overlay.querySelector(`#${messageId}`);
      if (message) {
        const contentDiv = message.querySelector(`.${CONFIG.namespace}-message-content`);
        contentDiv.innerHTML = this.formatMessage(content);
        this.elements.messages.scrollTop = this.elements.messages.scrollHeight;
      }
    }

    formatMessage(content) {
      if (!content) return '';
      
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
        
        this.addMessage('system', '✅ Image attached successfully!');
      } catch (error) {
        this.addMessage('system', `❌ Failed to attach image: ${error.message}`);
      }
    }

    promptImageAttachment() {
      this.addMessage('system', '💡 Click on any image on the page to attach it to your message.');
    }

    renderAttachedImages() {
      this.elements.attachedImages.innerHTML = this.attachedImages.map((img, index) => `
        <div class="${CONFIG.namespace}-attached-image">
          <img src="${img}" alt="Attached ${index + 1}">
          <button class="${CONFIG.namespace}-remove-image" onclick="window.__khanware_instance.removeImage(${index})">
            ✕
          </button>
        </div>
      `).join('');
    }

    removeImage(index) {
      this.attachedImages.splice(index, 1);
      this.renderAttachedImages();
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
        messages: this.currentChat.slice(1), // Exclude system prompt
        model: this.state.model
      };

      await store.add(chatData);
    }

    async loadChatHistory() {
      // Implementation for loading chat history
      // This would populate a sidebar or dropdown with previous conversations
    }

    clearChat() {
      if (confirm('Are you sure you want to clear the current conversation?')) {
        this.currentChat = [{
          role: 'system',
          content: SYSTEM_PROMPT
        }];
        this.elements.messages.innerHTML = '';
        this.addMessage('system', '🔄 Conversation cleared. Start fresh!');
      }
    }

    toggleTheme() {
      this.state.theme = this.state.theme === 'dark' ? 'light' : 'dark';
      this.overlay.setAttribute('data-theme', this.state.theme);
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
      this.overlay.classList.add('visible');
      this.floatingBtn.style.display = 'none';
      this.saveState();
      this.elements.input.focus();
    }

    hide() {
      this.state.visible = false;
      this.overlay.classList.remove('visible');
      this.floatingBtn.style.display = 'flex';
      this.saveState();
    }

    isMobile() {
      return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    destroy() {
      // Clean up
      if (this.abortController) {
        this.abortController.abort();
      }
      if (this.db) {
        this.db.close();
      }
      this.overlay?.remove();
      this.floatingBtn?.remove();
      document.getElementById(`${CONFIG.namespace}-styles`)?.remove();
      window.__khanware_instance = null;
      window.__khanware_loaded = false;
    }
  }

  // Initialize
  window.__khanware_instance = new KhanwareChat();

  console.log('✨ Khanware AI Assistant loaded! Press Alt+K to toggle or use the floating button.');
})();
