(function() {
  'use strict';

  try {
    const OPENAI_API_KEY = '';
    const SYSTEM_PROMPT = `Be extremely concise and always respond on point, avoid all filler, excuses and pleasantries.`;

    if (window.__khanware_loaded) {
      if (window.__khanware_instance) {
        window.__khanware_instance.toggle();
      }
      return;
    }
    window.__khanware_loaded = true;

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
        try {
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
          
          if (OPENAI_API_KEY) {
            this.state.apiKey = OPENAI_API_KEY;
          }
          
          this.init().catch(err => {
            alert('Khanware failed to initialize: ' + err.message);
          });
        } catch (error) {
          alert('Khanware failed to load: ' + error.message);
        }
      }

      loadState() {
        try {
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
        } catch (error) {
          return {
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
      }

      saveState() {
        try {
          localStorage.setItem(`${CONFIG.namespace}_state`, JSON.stringify(this.state));
        } catch (error) {
        }
      }

      async init() {
        try {
          await this.initDB();
        } catch (error) {
        }
        
        this.createStyles();
        this.createFloatingButton();
        this.createOverlay();
        this.attachEventListeners();
        
        if (!this.state.apiKey) {
          this.show();
        }
      }

      async initDB() {
        return new Promise((resolve, reject) => {
          try {
            const request = indexedDB.open(CONFIG.dbName, CONFIG.dbVersion);
            
            request.onerror = () => {
              reject(request.error);
            };
            
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
          } catch (error) {
            reject(error);
          }
        });
      }

      createFloatingButton() {
        try {
          const existingBtn = document.querySelector(`.${CONFIG.namespace}-floating-btn`);
          if (existingBtn) existingBtn.remove();
          
          this.floatingBtn = document.createElement('button');
          this.floatingBtn.className = `${CONFIG.namespace}-floating-btn`;
          this.floatingBtn.innerHTML = '💬';
          this.floatingBtn.title = 'Open Khanware Chat';
          
          document.body.appendChild(this.floatingBtn);
          
          this.floatingBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.toggle();
          });
        } catch (error) {
        }
      }

      createStyles() {
        try {
          const existingStyles = document.getElementById(`${CONFIG.namespace}-styles`);
          if (existingStyles) existingStyles.remove();
          
          const style = document.createElement('style');
          style.id = `${CONFIG.namespace}-styles`;
          style.textContent = `
            .${CONFIG.namespace}-floating-btn {
              position: fixed !important;
              bottom: 20px !important;
              right: 20px !important;
              width: 60px !important;
              height: 60px !important;
              border-radius: 50% !important;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
              color: white !important;
              border: none !important;
              box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4) !important;
              cursor: pointer !important;
              z-index: 2147483646 !important;
              display: flex !important;
              align-items: center !important;
              justify-content: center !important;
              font-size: 28px !important;
              transition: transform 0.3s, box-shadow 0.3s !important;
            }

            .${CONFIG.namespace}-floating-btn:hover {
              transform: scale(1.1) !important;
              box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6) !important;
            }

            .${CONFIG.namespace}-floating-btn:active {
              transform: scale(0.95) !important;
            }

            .${CONFIG.namespace}-floating-btn.hidden {
              display: none !important;
            }

            .${CONFIG.namespace}-overlay {
              position: fixed !important;
              z-index: 2147483647 !important;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
              background: var(--bg-primary) !important;
              border-radius: 16px !important;
              overflow: hidden !important;
              display: none !important;
              box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3) !important;
              border: 1px solid var(--border-color) !important;
            }

            .${CONFIG.namespace}-overlay * {
              box-sizing: border-box !important;
            }

            .${CONFIG.namespace}-overlay.visible {
              display: flex !important;
            }

            .${CONFIG.namespace}-container {
              width: 100% !important;
              height: 100% !important;
              display: flex !important;
              flex-direction: column !important;
            }

            .${CONFIG.namespace}-header {
              padding: 16px 20px !important;
              display: flex !important;
              align-items: center !important;
              justify-content: space-between !important;
              cursor: move !important;
              user-select: none !important;
              background: var(--header-bg) !important;
              border-bottom: 1px solid var(--border-color) !important;
            }

            .${CONFIG.namespace}-title {
              font-weight: 600 !important;
              font-size: 16px !important;
              color: var(--text-primary) !important;
              display: flex !important;
              align-items: center !important;
              gap: 8px !important;
            }

            .${CONFIG.namespace}-controls {
              display: flex !important;
              gap: 8px !important;
            }

            .${CONFIG.namespace}-btn {
              padding: 8px 16px !important;
              border: none !important;
              border-radius: 8px !important;
              cursor: pointer !important;
              font-size: 14px !important;
              font-weight: 500 !important;
              transition: all 0.2s !important;
              background: var(--btn-bg) !important;
              color: var(--text-primary) !important;
            }

            .${CONFIG.namespace}-btn:hover {
              background: var(--btn-hover) !important;
              transform: translateY(-1px) !important;
            }

            .${CONFIG.namespace}-btn:active {
              transform: translateY(0) !important;
            }

            .${CONFIG.namespace}-btn-primary {
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
              color: white !important;
            }

            .${CONFIG.namespace}-btn-primary:hover {
              background: linear-gradient(135deg, #7c8ff0 0%, #8a5bb5 100%) !important;
            }

            .${CONFIG.namespace}-icon-btn {
              width: 32px !important;
              height: 32px !important;
              padding: 0 !important;
              display: flex !important;
              align-items: center !important;
              justify-content: center !important;
              font-size: 18px !important;
            }

            .${CONFIG.namespace}-settings {
              padding: 16px !important;
              background: var(--settings-bg) !important;
              border-bottom: 1px solid var(--border-color) !important;
            }

            .${CONFIG.namespace}-settings-grid {
              display: grid !important;
              grid-template-columns: 1fr 1fr !important;
              gap: 12px !important;
            }

            .${CONFIG.namespace}-input-group {
              display: flex !important;
              flex-direction: column !important;
              gap: 6px !important;
            }

            .${CONFIG.namespace}-input-group.full-width {
              grid-column: 1 / -1 !important;
            }

            .${CONFIG.namespace}-label {
              font-size: 12px !important;
              font-weight: 500 !important;
              color: var(--text-secondary) !important;
              text-transform: uppercase !important;
              letter-spacing: 0.5px !important;
            }

            .${CONFIG.namespace}-input,
            .${CONFIG.namespace}-select {
              padding: 8px 12px !important;
              border: 2px solid var(--border-color) !important;
              border-radius: 8px !important;
              font-size: 14px !important;
              background: var(--input-bg) !important;
              color: var(--text-primary) !important;
              transition: border-color 0.2s !important;
              outline: none !important;
            }

            .${CONFIG.namespace}-input:focus,
            .${CONFIG.namespace}-select:focus {
              border-color: #667eea !important;
            }

            .${CONFIG.namespace}-messages {
              flex: 1 !important;
              overflow-y: auto !important;
              padding: 20px !important;
              display: flex !important;
              flex-direction: column !important;
              gap: 16px !important;
              background: var(--bg-primary) !important;
            }

            .${CONFIG.namespace}-message {
              display: flex !important;
              gap: 12px !important;
              animation: slideIn 0.3s ease !important;
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
              width: 36px !important;
              height: 36px !important;
              border-radius: 10px !important;
              display: flex !important;
              align-items: center !important;
              justify-content: center !important;
              font-size: 18px !important;
              flex-shrink: 0 !important;
            }

            .${CONFIG.namespace}-avatar.user {
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
            }

            .${CONFIG.namespace}-avatar.assistant {
              background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%) !important;
            }

            .${CONFIG.namespace}-avatar.system {
              background: linear-gradient(135deg, #ee9ca7 0%, #ffdde1 100%) !important;
            }

            .${CONFIG.namespace}-message-content {
              flex: 1 !important;
              padding: 12px 16px !important;
              border-radius: 12px !important;
              background: var(--message-bg) !important;
              color: var(--text-primary) !important;
              font-size: 14px !important;
              line-height: 1.6 !important;
              word-wrap: break-word !important;
            }

            .${CONFIG.namespace}-message-content pre {
              background: var(--code-bg) !important;
              padding: 12px !important;
              border-radius: 8px !important;
              overflow-x: auto !important;
              margin: 8px 0 !important;
            }

            .${CONFIG.namespace}-message-content code {
              background: var(--code-bg) !important;
              padding: 2px 6px !important;
              border-radius: 4px !important;
              font-size: 13px !important;
              font-family: 'Monaco', 'Courier New', monospace !important;
            }

            .${CONFIG.namespace}-input-area {
              padding: 16px !important;
              background: var(--input-area-bg) !important;
              border-top: 1px solid var(--border-color) !important;
            }

            .${CONFIG.namespace}-textarea {
              width: 100% !important;
              min-height: 80px !important;
              max-height: 150px !important;
              padding: 12px !important;
              border: 2px solid var(--border-color) !important;
              border-radius: 12px !important;
              resize: vertical !important;
              font-size: 14px !important;
              font-family: inherit !important;
              background: var(--input-bg) !important;
              color: var(--text-primary) !important;
              transition: border-color 0.2s !important;
              outline: none !important;
            }

            .${CONFIG.namespace}-textarea:focus {
              border-color: #667eea !important;
            }

            .${CONFIG.namespace}-input-controls {
              display: flex !important;
              justify-content: space-between !important;
              align-items: center !important;
              margin-top: 12px !important;
            }

            .${CONFIG.namespace}-attached-images {
              display: flex !important;
              gap: 8px !important;
              flex-wrap: wrap !important;
              margin-bottom: 12px !important;
              min-height: 1px !important;
            }

            .${CONFIG.namespace}-attached-image {
              position: relative !important;
              width: 80px !important;
              height: 80px !important;
              border-radius: 8px !important;
              overflow: hidden !important;
              border: 2px solid var(--border-color) !important;
            }

            .${CONFIG.namespace}-attached-image img {
              width: 100% !important;
              height: 100% !important;
              object-fit: cover !important;
            }

            .${CONFIG.namespace}-remove-image {
              position: absolute !important;
              top: 4px !important;
              right: 4px !important;
              width: 24px !important;
              height: 24px !important;
              background: rgba(0, 0, 0, 0.8) !important;
              color: white !important;
              border: none !important;
              border-radius: 50% !important;
              cursor: pointer !important;
              display: flex !important;
              align-items: center !important;
              justify-content: center !important;
              font-size: 16px !important;
            }

            .${CONFIG.namespace}-loading {
              display: inline-flex !important;
              gap: 4px !important;
            }

            .${CONFIG.namespace}-loading span {
              width: 8px !important;
              height: 8px !important;
              border-radius: 50% !important;
              background: var(--text-secondary) !important;
              animation: bounce 1.4s infinite ease-in-out both !important;
            }

            .${CONFIG.namespace}-loading span:nth-child(1) {
              animation-delay: -0.32s !important;
            }

            .${CONFIG.namespace}-loading span:nth-child(2) {
              animation-delay: -0.16s !important;
            }

            @keyframes bounce {
              0%, 80%, 100% {
                transform: scale(0);
              }
              40% {
                transform: scale(1);
              }
            }

            .${CONFIG.namespace}-overlay[data-theme="dark"] {
              --bg-primary: #1a1a1a !important;
              --header-bg: linear-gradient(135deg, #2a2a2a 0%, #1f1f1f 100%) !important;
              --settings-bg: #242424 !important;
              --input-area-bg: #242424 !important;
              --message-bg: #2a2a2a !important;
              --input-bg: #1f1f1f !important;
              --code-bg: #0d0d0d !important;
              --btn-bg: #333333 !important;
              --btn-hover: #404040 !important;
              --border-color: #333333 !important;
              --text-primary: #ffffff !important;
              --text-secondary: #999999 !important;
            }

            .${CONFIG.namespace}-overlay[data-theme="light"] {
              --bg-primary: #ffffff !important;
              --header-bg: linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%) !important;
              --settings-bg: #f8f9fa !important;
              --input-area-bg: #f8f9fa !important;
              --message-bg: #f0f2f5 !important;
              --input-bg: #ffffff !important;
              --code-bg: #f8f9fa !important;
              --btn-bg: #e9ecef !important;
              --btn-hover: #dee2e6 !important;
              --border-color: #dee2e6 !important;
              --text-primary: #212529 !important;
              --text-secondary: #6c757d !important;
            }

            @media (max-width: 768px) {
              .${CONFIG.namespace}-overlay {
                width: 100% !important;
                height: 100% !important;
                top: 0 !important;
                left: 0 !important;
                border-radius: 0 !important;
                max-width: none !important;
                max-height: none !important;
              }

              .${CONFIG.namespace}-settings-grid {
                grid-template-columns: 1fr !important;
              }

              .${CONFIG.namespace}-header {
                cursor: default !important;
              }
            }
          `;
          document.head.appendChild(style);
        } catch (error) {
        }
      }

      createOverlay() {
        try {
          const existingOverlay = document.querySelector(`.${CONFIG.namespace}-overlay`);
          if (existingOverlay) existingOverlay.remove();
          
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
                <div class="${CONFIG.namespace}-title">✨ Khanware AI Assistant</div>
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
                           value="${this.state.apiKey || ''}">
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
          `;

          document.body.appendChild(this.overlay);

          this.elements = {
            messages: this.overlay.querySelector('#messages'),
            input: this.overlay.querySelector('#message-input'),
            apiKey: this.overlay.querySelector('#api-key'),
            modelSelect: this.overlay.querySelector('#model-select'),
            reasoningSelect: this.overlay.querySelector('#reasoning-select'),
            attachedImages: this.overlay.querySelector('#attached-images'),
            header: this.overlay.querySelector(`.${CONFIG.namespace}-header`)
          };
          
          this.addMessage('system', '👋 Welcome to Khanware! Please enter your OpenAI API key to get started.');
        } catch (error) {
        }
      }

      attachEventListeners() {
        try {
          this.keydownHandler = (e) => {
            if (e.altKey && (e.key === 'k' || e.key === 'K')) {
              e.preventDefault();
              this.toggle();
            }
            if (e.key === 'Escape' && this.state.visible) {
              this.hide();
            }
          };
          document.addEventListener('keydown', this.keydownHandler);

          this.overlay.addEventListener('click', (e) => {
            const action = e.target.dataset?.action;
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
          });

          this.elements.apiKey.addEventListener('change', (e) => {
            this.state.apiKey = e.target.value;
            this.saveState();
          });

          this.elements.modelSelect.addEventListener('change', (e) => {
            this.state.model = e.target.value;
            this.saveState();
          });

          this.elements.reasoningSelect.addEventListener('change', (e) => {
            this.state.reasoning = e.target.value;
            this.saveState();
          });

          this.elements.input.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
              e.preventDefault();
              this.sendMessage();
            }
          });

          if (!this.isMobile()) {
            let isDragging = false;
            let dragOffset = { x: 0, y: 0 };

            this.elements.header.addEventListener('mousedown', (e) => {
              isDragging = true;
              dragOffset = {
                x: e.clientX - this.state.position.x,
                y: e.clientY - this.state.position.y
              };
            });

            document.addEventListener('mousemove', (e) => {
              if (isDragging) {
                this.state.position.x = e.clientX - dragOffset.x;
                this.state.position.y = e.clientY - dragOffset.y;
                this.overlay.style.left = `${this.state.position.x}px`;
                this.overlay.style.top = `${this.state.position.y}px`;
              }
            });

            document.addEventListener('mouseup', () => {
              if (isDragging) {
                isDragging = false;
                this.saveState();
              }
            });
          }

          this.imageClickHandler = (e) => {
            if (e.target.tagName === 'IMG' && 
                this.state.visible && 
                !e.target.closest(`.${CONFIG.namespace}-overlay`)) {
              e.preventDefault();
              e.stopPropagation();
              this.attachImage(e.target);
            }
          };
          document.addEventListener('click', this.imageClickHandler);
        } catch (error) {
        }
      }

      async sendMessage() {
        try {
          const message = this.elements.input.value.trim();
          if (!message && this.attachedImages.length === 0) return;

          if (!this.state.apiKey) {
            this.addMessage('system', '⚠️ Please enter your OpenAI API key first.');
            return;
          }

          const userMessage = { role: 'user', content: message };
          
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

          const assistantMsgId = this.addMessage('assistant', '', [], true);

          await this.streamCompletion(assistantMsgId);
        } catch (error) {
          this.addMessage('system', `❌ Error: ${error.message}`);
        }
      }

      async streamCompletion(messageId) {
        try {
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
            const errorText = await response.text();
            let errorMessage = `API Error: ${response.status}`;
            try {
              const errorJson = JSON.parse(errorText);
              errorMessage = errorJson.error?.message || errorMessage;
            } catch (e) {
              errorMessage = errorText || errorMessage;
            }
            throw new Error(errorMessage);
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
                }
              }
            }
          }

          this.currentChat.push({ role: 'assistant', content: fullContent });
          
          if (this.db) {
            await this.saveChatToHistory();
          }
        } catch (error) {
          this.updateMessage(messageId, `❌ Error: ${error.message}`);
        }
      }

      addMessage(role, content, images = [], isStreaming = false) {
        try {
          const messageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          const messageDiv = document.createElement('div');
          messageDiv.className = `${CONFIG.namespace}-message`;
          messageDiv.id = messageId;

          const avatarDiv = document.createElement('div');
          avatarDiv.className = `${CONFIG.namespace}-avatar ${role}`;
          avatarDiv.innerHTML = role === 'user' ? '👤' : role === 'assistant' ? '🤖' : 'ℹ️';

          const contentDiv = document.createElement('div');
          contentDiv.className = `${CONFIG.namespace}-message-content`;
          
          if (images && images.length > 0) {
            const imagesHtml = images.map(img => 
              `<img src="${img}" style="max-width: 100%; margin: 8px 0; border-radius: 8px;">`
            ).join('');
            contentDiv.innerHTML = imagesHtml;
          }
          
          if (isStreaming) {
            const loadingHtml = `
              <div class="${CONFIG.namespace}-loading">
                <span></span>
                <span></span>
                <span></span>
              </div>
            `;
            contentDiv.innerHTML += loadingHtml;
          } else {
            contentDiv.innerHTML += this.formatMessage(content);
          }

          messageDiv.appendChild(avatarDiv);
          messageDiv.appendChild(contentDiv);
          this.elements.messages.appendChild(messageDiv);
          this.elements.messages.scrollTop = this.elements.messages.scrollHeight;

          return messageId;
        } catch (error) {
          return null;
        }
      }

      updateMessage(messageId, content) {
        try {
          const message = this.overlay.querySelector(`#${messageId}`);
          if (message) {
            const contentDiv = message.querySelector(`.${CONFIG.namespace}-message-content`);
            contentDiv.innerHTML = this.formatMessage(content);
            this.elements.messages.scrollTop = this.elements.messages.scrollHeight;
          }
        } catch (error) {
        }
      }

      formatMessage(content) {
        if (!content) return '';
        
        const escapeHtml = (text) => {
          const div = document.createElement('div');
          div.textContent = text;
          return div.innerHTML;
        };
        
        return content
          .split('```').map((part, i) => {
            if (i % 2 === 1) {
              return `<pre><code>${escapeHtml(part)}</code></pre>`;
            }
            return escapeHtml(part)
              .replace(/`([^`]+)`/g, '<code>$1</code>')
              .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
              .replace(/\*(.*?)\*/g, '<em>$1</em>')
              .replace(/\n/g, '<br>');
          }).join('');
      }

      attachImage(img) {
        try {
          const canvas = document.createElement('canvas');
          const maxSize = 800;
          let width = img.naturalWidth || img.width;
          let height = img.naturalHeight || img.height;
          
          if (width > maxSize || height > maxSize) {
            const ratio = Math.min(maxSize / width, maxSize / height);
            width *= ratio;
            height *= ratio;
          }
          
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
          
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
        try {
          this.elements.attachedImages.innerHTML = this.attachedImages.map((img, index) => `
            <div class="${CONFIG.namespace}-attached-image">
              <img src="${img}" alt="Attached ${index + 1}">
              <button class="${CONFIG.namespace}-remove-image" data-index="${index}">✕</button>
            </div>
          `).join('');

          this.elements.attachedImages.querySelectorAll(`.${CONFIG.namespace}-remove-image`).forEach(btn => {
            btn.addEventListener('click', (e) => {
              const index = parseInt(e.target.dataset.index);
              this.removeImage(index);
            });
          });
        } catch (error) {
        }
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
        try {
          if (!this.db) return;

          const transaction = this.db.transaction([CONFIG.storeName], 'readwrite');
          const store = transaction.objectStore(CONFIG.storeName);
          
          const chatData = {
            timestamp: Date.now(),
            messages: this.currentChat.slice(1),
            model: this.state.model
          };

          await store.add(chatData);
        } catch (error) {
        }
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
        this.floatingBtn.classList.add('hidden');
        this.saveState();
        this.elements.input.focus();
      }

      hide() {
        this.state.visible = false;
        this.overlay.classList.remove('visible');
        this.floatingBtn.classList.remove('hidden');
        this.saveState();
      }

      isMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      }

      destroy() {
        try {
          if (this.keydownHandler) {
            document.removeEventListener('keydown', this.keydownHandler);
          }
          if (this.imageClickHandler) {
            document.removeEventListener('click', this.imageClickHandler);
          }

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
        } catch (error) {
        }
      }
    }

    window.__khanware_instance = new KhanwareChat();
  } catch (error) {
    alert('Khanware failed to load: ' + error.message);
  }
})();
