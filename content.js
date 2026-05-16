// content.js — Clawmander Snitch Floating Companion Overlay
// Injects a persistent lofi companion into every page using Shadow DOM.

(function() {
  // Don't inject into extension pages or chrome:// pages
  if (window.location.protocol === 'chrome-extension:' || window.location.protocol === 'chrome:') return;

  // Prevent double injection
  if (document.getElementById('whisperdump-companion-root')) return;

  // === Create Host Element ===
  const host = document.createElement('div');
  host.id = 'whisperdump-companion-root';
  host.style.cssText = 'all: initial; position: fixed; z-index: 2147483647;';
  document.body.appendChild(host);

  // === Shadow DOM ===
  const shadow = host.attachShadow({ mode: 'open' });

  // === Inject Styles ===
  const style = document.createElement('style');
  style.textContent = `
    :host {
      all: initial;
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 2147483647;
      font-family: 'Courier Prime', 'Courier New', monospace;
    }

    .companion-container {
      position: relative;
      cursor: grab;
      transition: transform 0.3s ease, opacity 0.3s ease;
      user-select: none;
    }
    .companion-container:active {
      cursor: grabbing;
    }
    .companion-container:hover {
      transform: scale(1.05);
    }

    .companion-avatar {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      border: 4px solid #D35400; /* Burnt Orange */
      box-shadow: 0 0 20px rgba(211, 84, 0, 0.3), 0 8px 16px rgba(0,0,0,0.4);
      object-fit: cover;
      background: #FFFDD0; /* Cream Base */
      transition: all 0.3s ease;
    }

    /* State animations */
    .companion-container.idle .companion-avatar {
      animation: idle-breathe 4s ease-in-out infinite;
    }
    .companion-container.nudging .companion-avatar {
      animation: nudge-bounce 0.6s ease-in-out infinite;
      border-color: #FFDB58; /* Mustard Yellow */
      box-shadow: 0 0 24px rgba(255, 219, 88, 0.5);
    }
    .companion-container.celebrating .companion-avatar {
      animation: celebrate-spin 1s ease-in-out;
      border-color: #568203; /* Avo Green */
      box-shadow: 0 0 24px rgba(86, 130, 3, 0.5);
    }
    .companion-container.alert .companion-avatar {
      animation: alert-shake 0.4s ease-in-out infinite;
      border-color: #FF6EB4; /* Bubble Gum Pink */
      box-shadow: 0 0 24px rgba(255, 110, 180, 0.5);
    }

    @keyframes idle-breathe {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.05); }
    }
    @keyframes nudge-bounce {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-8px); }
    }
    @keyframes celebrate-spin {
      0% { transform: rotate(0deg) scale(1); }
      50% { transform: rotate(15deg) scale(1.15); }
      100% { transform: rotate(0deg) scale(1); }
    }
    @keyframes alert-shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-4px); }
      75% { transform: translateX(4px); }
    }

    /* Bubble / flag */
    .companion-bubble {
      position: absolute;
      bottom: 90px;
      right: 0;
      background: #FFFDD0; /* Cream Base */
      border: 2px solid #D35400; /* Burnt Orange */
      border-radius: 16px 16px 4px 16px;
      padding: 12px 16px;
      color: #5D4037; /* Brown text */
      font-size: 14px;
      font-weight: bold;
      max-width: 220px;
      line-height: 1.4;
      box-shadow: 8px 8px 0 rgba(211, 84, 0, 0.2);
      opacity: 0;
      transform: translateY(10px) scale(0.9);
      transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      pointer-events: none;
    }
    .companion-bubble.visible {
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events: auto;
    }
    .companion-bubble .bubble-category {
      display: inline-block;
      font-size: 10px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 1px;
      padding: 2px 8px;
      border-radius: 4px;
      background: #FF6EB4; /* Bubble Gum Pink */
      color: #fff;
      margin-bottom: 6px;
    }
    .companion-bubble .bubble-text {
      display: block;
    }

    /* Status ring */
    .status-ring {
      position: absolute;
      bottom: 4px;
      right: 4px;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: #568203; /* Avo Green */
      border: 3px solid #FFFDD0;
      box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    }
    .status-ring.offline { background: #FF6EB4; }

    /* Minimize button */
    .minimize-btn {
      position: absolute;
      top: -15px;
      right: -15px;
      width: 20px;
      height: 20px;
      background: #D35400;
      color: #FFFDD0;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      cursor: pointer;
      opacity: 0;
      transition: opacity 0.3s;
      border: 2px solid #FFFDD0;
      z-index: 10;
    }
    .companion-container:hover .minimize-btn {
      opacity: 1;
    }
    .companion-container.minimized .companion-avatar {
      width: 30px;
      height: 30px;
    }
    .companion-container.minimized .companion-bubble {
      display: none;
    }

    /* LoFi Desk Mode */
    .companion-container.lofi {
      width: 300px;
      height: 200px;
      background: #FFFDD0;
      border: 3px solid #D35400;
      border-radius: 20px;
      padding: 12px;
      box-shadow: 12px 12px 0 rgba(211, 84, 0, 0.15);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-end;
      overflow: hidden;
    }

    .companion-container.lofi .companion-avatar {
      width: 100%;
      height: 100%;
      position: absolute;
      top: 0;
      left: 0;
      border-radius: 16px;
      border: none;
      z-index: -1;
      opacity: 0.9;
      object-fit: cover;
    }

    .companion-container.lofi::after {
      content: 'SNITCH MONITOR V1.3';
      position: absolute;
      top: 12px;
      left: 15px;
      font-size: 10px;
      font-weight: 900;
      color: #D35400;
      letter-spacing: 1px;
      opacity: 0.8;
    }

    /* Drag Handle Overlay */
    .drag-handle {
      position: absolute;
      top: -10px;
      left: 50%;
      transform: translateX(-50%);
      width: 40px;
      height: 4px;
      background: rgba(211, 84, 0, 0.3);
      border-radius: 2px;
      opacity: 0;
      transition: opacity 0.3s;
    }
    .companion-container:hover .drag-handle {
      opacity: 1;
    }
  `;
  shadow.appendChild(style);

  // === Build DOM ===
  const container = document.createElement('div');
  container.className = 'companion-container idle';

  const dragHandle = document.createElement('div');
  dragHandle.className = 'drag-handle';
  container.appendChild(dragHandle);

  let avatar = document.createElement('img');
  avatar.className = 'companion-avatar';
  
  function updateAvatarSrc(customUrl) {
    const isVideo = customUrl && (customUrl.toLowerCase().endsWith('.mp4') || customUrl.toLowerCase().endsWith('.webm'));
    const oldAvatar = container.querySelector('.companion-avatar');
    if (oldAvatar) oldAvatar.remove();
    
    if (isVideo) {
      avatar = document.createElement('video');
      avatar.className = 'companion-avatar';
      avatar.src = customUrl;
      avatar.loop = true;
      avatar.muted = true;
      avatar.autoplay = true;
      avatar.setAttribute('playsinline', '');
      avatar.play().catch(() => {});
    } else {
      avatar = document.createElement('img');
      avatar.className = 'companion-avatar';
      avatar.src = customUrl || chrome.runtime.getURL('assets/icon128.png');
      avatar.onerror = () => {
        avatar.src = chrome.runtime.getURL('assets/icon128.png');
      };
    }
    container.insertBefore(avatar, container.firstChild);
  }

  const bubble = document.createElement('div');
  bubble.className = 'companion-bubble';

  const minimizeBtn = document.createElement('div');
  minimizeBtn.className = 'minimize-btn';
  minimizeBtn.textContent = '−';
  minimizeBtn.title = 'Minimize';
  minimizeBtn.onclick = (e) => {
    e.stopPropagation();
    container.classList.toggle('minimized');
    minimizeBtn.textContent = container.classList.contains('minimized') ? '+' : '−';
  };
  container.appendChild(minimizeBtn);

  container.appendChild(statusRing);
  container.appendChild(bubble);
  shadow.appendChild(container);

  // === Draggable Logic ===
  let isDragging = false;
  let startX, startY, initialRight, initialBottom;

  function onMouseDown(e) {
    if (e.target.closest('.companion-bubble')) return;
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    
    const style = window.getComputedStyle(host);
    initialRight = parseInt(style.right, 10);
    initialBottom = parseInt(style.bottom, 10);
    
    container.style.transition = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  function onMouseMove(e) {
    if (!isDragging) return;
    const dx = startX - e.clientX;
    const dy = startY - e.clientY;
    host.style.right = (initialRight + dx) + 'px';
    host.style.bottom = (initialBottom + dy) + 'px';
  }

  function onMouseUp() {
    if (!isDragging) return;
    isDragging = false;
    container.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    
    chrome.storage.sync.set({
      posRight: host.style.right,
      posBottom: host.style.bottom
    });
  }

  container.addEventListener('mousedown', onMouseDown);

  let clickStartTime;
  container.addEventListener('mousedown', () => clickStartTime = Date.now());
  container.addEventListener('click', (e) => {
    if (Date.now() - clickStartTime > 200) return;
    if (e.target.closest('.companion-bubble')) return;
    
    chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' });
    bubble.classList.remove('visible');
    container.classList.remove('nudging', 'celebrating', 'alert');
    container.classList.add('idle');
  });

  // === Compliance Engine ===
  const compliancePatterns = [
    { type: 'DECISION', regex: /(?:i(?:'ve| have) decided to|let's go with|i will|decision:|moving forward with|set to|we are going to|finalized|conclusion:)/i, label: 'Decision Logged' },
    { type: 'CORRECTION', regex: /(?:wait|stop|don't|mistake|incorrect|correction:|actually|revising|no, that's wrong|oops|cancel|revert)/i, label: 'Correction Noted' },
    { type: 'APPROVAL', regex: /(?:looks good|proceed|approved|perfect|yes|confirm|agreed|that's it|ship it)/i, label: 'Approval Recorded' }
  ];

  let lastInputTime = 0;
  const INPUT_THROTTLE = 2500;

  async function runComplianceCheck(text, isInput = false) {
    if (!text || text.length < 5) return;

    // Strategic Audit (Drift Detection)
    if (isInput) {
      chrome.runtime.sendMessage({ type: 'PERFORM_AUDIT', text }, (response) => {
        if (response && response.success && response.verdict) {
          const verdict = response.verdict;
          if (verdict.status === 'FAIL' || verdict.status === 'WARN') {
            const auditMsg = {
              type: 'NUDGE',
              category: 'compliance',
              title: verdict.violation_type,
              message: verdict.audit_report.observation,
              why_it_matters: verdict.audit_report.conflict_source,
              recommended_move: verdict.audit_report.correction_path,
              severity: verdict.severity
            };
            
            showNudgeBubble(auditMsg);
            chrome.runtime.sendMessage(auditMsg);
          }
        }
      });
    }

    for (const pattern of compliancePatterns) {
      if (pattern.regex.test(text)) {
        const now = Date.now();
        if (isInput && now - lastInputTime < INPUT_THROTTLE) return;
        
        if (isInput) lastInputTime = now;

        // Log to Supabase via background
        chrome.runtime.sendMessage({
          type: 'LOG_COMPLIANCE',
          data: {
            type: pattern.type,
            content: text.trim(),
            is_user_input: isInput
          }
        });

        // Visual Feedback
        showNudgeBubble({
          category: isInput ? 'compliance' : 'monitoring',
          title: pattern.label,
          message: isInput ? `I've logged your ${pattern.type.toLowerCase()}.` : `Recorded ${pattern.type.toLowerCase()} from AI.`
        });
        
        break; 
      }
    }
  }

  // Monitor text areas and contenteditable divs
  document.addEventListener('input', (e) => {
    const target = e.target;
    if (target.tagName === 'TEXTAREA' || target.getAttribute('contenteditable') === 'true' || target.tagName === 'INPUT') {
      const text = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' ? target.value : target.innerText;
      runComplianceCheck(text, true);
    }
  }, true);

  // Handle Paste (for screenshots/images)
  document.addEventListener('paste', (e) => {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (const item of items) {
      if (item.type.indexOf('image') !== -1) {
        const blob = item.getAsFile();
        const reader = new FileReader();
        reader.onload = (event) => {
          chrome.runtime.sendMessage({
            type: 'LOG_COMPLIANCE',
            data: {
              type: 'VISION_LOG',
              content: '[User pasted an image/screenshot]',
              metadata: { image_data: event.target.result }
            }
          });
          showNudgeBubble({
            category: 'monitoring',
            title: 'Visual Logged',
            message: "I've captured the image you pasted."
          });
        };
        reader.readAsDataURL(blob);
      }
    }
  }, true);

  // Monitor chat logs (incoming AI messages)
  const chatObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.addedNodes.length) {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Focus on likely chat message containers
            const text = node.innerText;
            if (text && text.length > 20) {
              runComplianceCheck(text, false);
            }
          }
        });
      }
    }
  });

  chatObserver.observe(document.body, { childList: true, subtree: true });

  // === Load Settings & Position ===
  chrome.storage.sync.get(['avatarUrl', 'lofiMode', 'posRight', 'posBottom'], (data) => {
    updateAvatarSrc(data.avatarUrl);
    if (data.lofiMode) container.classList.add('lofi');
    if (data.posRight) host.style.right = data.posRight;
    if (data.posBottom) host.style.bottom = data.posBottom;
  });

  // === Thread Scraping (For Deep Audit) ===
  function scrapeThread() {
    const thread = [];
    const hostname = window.location.hostname;

    if (hostname.includes('gemini.google.com')) {
      // Gemini specific selectors
      const entries = document.querySelectorAll('.conversation-container .chat-entry');
      entries.forEach(entry => {
        const isUser = entry.classList.contains('user-query');
        const role = isUser ? 'user' : 'assistant';
        const content = entry.querySelector('.message-content, .query-text')?.innerText || '';
        if (content) thread.push({ role, content });
      });
    } else if (hostname.includes('claude.ai')) {
      // Claude specific selectors
      const messages = document.querySelectorAll('.font-claude-message, .font-user-message');
      messages.forEach(msg => {
        const role = msg.classList.contains('font-user-message') ? 'user' : 'assistant';
        const content = msg.innerText || '';
        if (content) thread.push({ role, content });
      });
    } else if (hostname.includes('chatgpt.com')) {
      // ChatGPT specific selectors
      const messages = document.querySelectorAll('[data-testid^="conversation-turn-"]');
      messages.forEach(turn => {
        const role = turn.querySelector('[data-testid="author-name-user"]') ? 'user' : 'assistant';
        const content = turn.querySelector('.markdown, .whitespace-pre-wrap')?.innerText || '';
        if (content) thread.push({ role, content });
      });
    } else {
      // Generic fallback - look for blocks of text that look like messages
      const possibleMessages = document.querySelectorAll('p, div.message, .chat-message');
      possibleMessages.forEach(el => {
        const text = el.innerText.trim();
        if (text.length > 30) {
          thread.push({ role: 'unknown', content: text });
        }
      });
    }

    return thread;
  }

  // === Hide History Logic ===
  const hideHistoryStyle = document.createElement('style');
  hideHistoryStyle.id = 'snitch-hide-history-style';
  hideHistoryStyle.textContent = `
    /* Gemini */
    .conversation-container .chat-entry:not(:last-child),
    /* Claude */
    div[class*="ChatMessage"]:not(:last-of-type),
    /* ChatGPT */
    [data-testid^="conversation-turn-"]:not(:last-child) {
      filter: blur(10px) grayscale(1);
      opacity: 0.1;
      pointer-events: none;
      transition: all 0.5s ease;
    }
  `;

  function toggleHideHistory(enabled) {
    if (enabled) {
      if (!document.getElementById('snitch-hide-history-style')) {
        document.head.appendChild(hideHistoryStyle);
      }
    } else {
      const el = document.getElementById('snitch-hide-history-style');
      if (el) el.remove();
    }
  }

  // === Real-time Scraper ===
  let realtimeEnabled = false;
  let lastThreadLength = 0;
  let auditPending = false;

  const scraperObserver = new MutationObserver((mutations) => {
    if (!realtimeEnabled || auditPending) return;
    
    const thread = scrapeThread();
    // Only audit if the thread length has increased (new message)
    if (thread.length > lastThreadLength) {
      lastThreadLength = thread.length;
      auditPending = true;
      
      // Debounce the audit to allow messages to finish rendering
      setTimeout(() => {
        console.log('Snitch: New message detected, running thread audit...', thread.length);
        chrome.runtime.sendMessage({ 
          type: 'RUN_DEEP_AUDIT', 
          thread: thread 
        }, (response) => {
          auditPending = false;
          if (response && response.success) {
            console.log('Snitch: Real-time audit complete.');
          }
        });
      }, 5000); // 5 second debounce
    }
  });

  // Start observing
  scraperObserver.observe(document.body, { childList: true, subtree: true });

  // === Message Handling (Updated) ===
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'NUDGE') {
      showNudgeBubble(message);
    }
    if (message.type === 'SETTINGS_UPDATED') {
      updateAvatarSrc(message.avatarUrl);
      if (message.lofiMode) container.classList.add('lofi');
      else container.classList.remove('lofi');
    }
    if (message.type === 'TOGGLE_CHANGED') {
      if (message.realtimeRecord !== undefined) {
        realtimeEnabled = message.realtimeRecord;
        if (realtimeEnabled) {
          // Force an immediate audit when enabled
          lastThreadLength = 0; 
        }
      }
      if (message.hideHistory !== undefined) toggleHideHistory(message.hideHistory);
    }
    if (message.type === 'SCRAPE_THREAD') {
      const thread = scrapeThread();
      sendResponse({ success: true, thread });
    }
    return true; 
  });

  // Initial Sync
  chrome.storage.local.get(['realtime_record_enabled', 'hide_history_enabled'], (data) => {
    realtimeEnabled = data.realtime_record_enabled || false;
    toggleHideHistory(data.hide_history_enabled || false);
  });

  function showNudgeBubble(data) {
    const category = data.category || 'focus';
    container.classList.remove('idle', 'nudging', 'celebrating', 'alert');
    
    if (category === 'celebration') container.classList.add('celebrating');
    else if (category === 'warning' || category === 'compliance') container.classList.add('alert');
    else container.classList.add('nudging');

    bubble.innerHTML = `
      <span class="bubble-category">${category}</span>
      <span class="bubble-text">${escapeHtml(data.title || data.message || 'Incoming Alert!')}</span>
    `;
    bubble.classList.add('visible');

    setTimeout(() => {
      bubble.classList.remove('visible');
      container.classList.remove('nudging', 'celebrating', 'alert');
      container.classList.add('idle');
    }, 8000);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

})();
