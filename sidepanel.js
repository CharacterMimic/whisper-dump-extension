// sidepanel.js — WhisperDump Side Panel
// Handles: chat with Boss, brain dumps, reminders, nudge display

const OPENCLAW_WS = 'ws://146.190.116.20:8080';
const OPENCLAW_HTTP = 'http://146.190.116.20:8081';
const AUDITOR_HTTP = 'http://137.184.235.85:8000'; // n8n Droplet Auditor Service

// === DOM ===
const messagesList = document.getElementById('messages-list');
const messagesArea = document.getElementById('messages-area');
const nudgeDetail = document.getElementById('nudge-detail');
const wsStatus = document.getElementById('ws-status');
const wsLabel = document.getElementById('ws-label');

const commandInput = document.getElementById('command-input');
const commandSend = document.getElementById('command-send');
const dumpInput = document.getElementById('dump-input');
const dumpSend = document.getElementById('dump-send');
const reminderInput = document.getElementById('reminder-input');
const reminderSend = document.getElementById('reminder-send');
const deepSyncBtn = document.getElementById('deep-sync-btn');
const deepAuditBtn = document.getElementById('deep-audit-btn');
const finalizeAuditBtn = document.getElementById('finalize-audit-btn');
const realtimeRecordToggle = document.getElementById('realtime-record-toggle');
const hideHistoryToggle = document.getElementById('hide-history-toggle');


// === Settings Persistence ===
function loadSettings() {
  // Load UI-only settings from sync
  chrome.storage.sync.get([
    'voiceEnabled', 
    'avatarUrl', 
    'selectedVoice', 
    'voiceProvider', 
    'elevenApiKey', 
    'elevenVoiceId', 
    'lofiMode'
  ], (data) => {
    if (data.voiceEnabled !== undefined) {
      voiceEnabled = data.voiceEnabled;
      updateVoiceToggleUI();
    }
    if (data.avatarUrl) avatarUrlInput.value = data.avatarUrl;
    if (data.selectedVoice) voiceSelect.value = data.selectedVoice;
    
    if (data.voiceProvider) {
      voiceProviderSelect.value = data.voiceProvider;
      toggleVoiceConfigUI(data.voiceProvider);
    }
    if (data.elevenApiKey) elevenApiKeyInput.value = data.elevenApiKey;
    if (data.elevenVoiceId) elevenVoiceIdInput.value = data.elevenVoiceId;
    if (data.lofiMode !== undefined) {
      lofiModeToggle.checked = data.lofiMode;
      updateLofiMode(data.lofiMode);
    }
    
    // Load stateful toggles from local
    chrome.storage.local.get([
      'cbh_context', 
      'drift_detection_enabled',
      'realtime_record_enabled',
      'hide_history_enabled'
    ], (localData) => {
      if (localData.cbh_context) cbhContextInput.value = localData.cbh_context;
      if (localData.drift_detection_enabled !== undefined) driftDetectionToggle.checked = localData.drift_detection_enabled;
      if (localData.realtime_record_enabled !== undefined) realtimeRecordToggle.checked = localData.realtime_record_enabled;
      if (localData.hide_history_enabled !== undefined) hideHistoryToggle.checked = localData.hide_history_enabled;
    });
  });
}

if (realtimeRecordToggle) {
  realtimeRecordToggle.addEventListener('change', (e) => {
    const enabled = e.target.checked;
    chrome.storage.local.set({ realtime_record_enabled: enabled });
    
    if (enabled) {
      addMessage('Real-time recording started. Analyzing history...', 'system', '⏺️');
      speak("Recording started. I'm analyzing the thread history and watching for drift.");
      startRealtimeAudit();
    } else {
      addMessage('Real-time recording stopped.', 'system', '⏹️');
      speak("Recording stopped.");
    }
  });
}

// === Auditor Logic ===

async function startRealtimeAudit() {
  const cbh = cbhContextInput.value || "Default: Stay on task.";
  
  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    if (!tabs[0]) return;
    const sessionId = tabs[0].id.toString();

    addMessage('Analyzing page thread for strategic baseline...', 'system', '🔍');
    
    // Scrape the thread from the current page
    chrome.tabs.sendMessage(tabs[0].id, { type: 'SCRAPE_THREAD' }, async (scrapeRes) => {
      let messages = [];
      if (scrapeRes && scrapeRes.success && scrapeRes.thread) {
        messages = scrapeRes.thread;
        addMessage(`Captured ${messages.length} turns from page.`, 'system', '📦');
      } else {
        // Fallback to sidepanel messages
        messages = Array.from(messagesList.querySelectorAll('.message:not(.system)')).map(msg => ({
          role: msg.classList.contains('user') ? 'user' : 'assistant',
          content: msg.querySelector('.msg-text')?.textContent || ""
        }));
      }

      try {
        const resp = await fetch(`${AUDITOR_HTTP}/audit/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            thread_messages: messages,
            cbh_context: cbh,
            session_id: sessionId
          })
        });
        const result = await resp.json();
        
        if (result.status === "FAIL" || (result.strategic_drift_analysis && result.strategic_drift_analysis.score > 0.7)) {
          const reasoning = result.strategic_drift_analysis?.reasoning || "High drift detected.";
          addMessage(`Baseline Drift Detected: ${reasoning}`, 'error', '⚠️ DRIFT');
          speak("Strategic drift detected in history. I've flagged the conflicts.");
        } else {
          addMessage('Baseline established. Live surveillance active.', 'system', '✅');
          speak("Baseline established. Surveillance active.");
        }

        // Display recorded facts from history
        const facts = result.canonical_updates || [];
        if (facts.length > 0) {
          facts.forEach(update => {
            addMessage(`INDEXED FACT: ${update.fact}`, 'system', '📌');
          });
        }
      } catch (err) {
        console.error('Audit init failed:', err);
        addMessage('Auditor offline. Check backend service.', 'error');
      }
    });
  });
}

async function auditLatestTurn(role, text) {
  // Run audit if EITHER drift detection or realtime record is on
  if (!driftDetectionToggle.checked && !realtimeRecordToggle.checked) return;

  const cbh = cbhContextInput.value || "Default: Stay on task.";
  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    if (!tabs[0]) return;
    const sessionId = tabs[0].id.toString();

    try {
      const resp = await fetch(`${AUDITOR_HTTP}/audit/turn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: { role, content: text },
          cbh_context: cbh,
          session_id: sessionId
        })
      });
      const result = await resp.json();
      
      const drift = result.strategic_drift_analysis;
      if (result.status === "FAIL") {
        addMessage(`DRIFT DETECTED: ${drift.reasoning}`, 'error', '⚠️ DRIFT');
        if (drift.correction_prompt) {
          addMessage(`CORRECTION: ${drift.correction_prompt}`, 'system', '🎯 PATH');
        }
        speak(`Warning: Strategic drift detected.`);
      } else if (result.status === "WARN") {
        addMessage(`SKEPTICAL WARNING: ${drift.reasoning}`, 'system', '🧐 WARN');
        speak("I'm skeptical of this direction.");
      }

      const updates = result.canonical_updates || [];
      updates.forEach(update => {
        addMessage(`FACT COMMITTED: ${update.fact}`, 'system', '📌 COMMIT');
      });

      const flags = result.active_flags || [];
      flags.forEach(flag => {
        addMessage(`CONFLICT: ${flag.contradiction}`, 'error', '⚖️ FLAG');
      });
    } catch (err) {
      console.warn('Turn audit failed:', err);
    }
  });
}

if (driftDetectionToggle) {
  driftDetectionToggle.addEventListener('change', (e) => {
    if (e.target.checked) {
      startRealtimeAudit();
    } else {
      addMessage('Strategic Audit Disabled.', 'system', '⏹️');
    }
  });
}

if (hideHistoryToggle) {
  hideHistoryToggle.addEventListener('change', (e) => {
    const enabled = e.target.checked;
    chrome.storage.local.set({ hide_history_enabled: enabled });
    
    // Toggle class on existing messages
    const messages = messagesList.querySelectorAll('.message:not(.system):not(.error)');
    messages.forEach(msg => {
      if (enabled && !msg.querySelector('.msg-label')?.textContent.includes('Conflict')) {
        msg.classList.add('hidden-by-history');
      } else {
        msg.classList.remove('hidden-by-history');
      }
    });

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'TOGGLE_CHANGED', hideHistory: enabled }).catch(err => {
          console.warn('Failed to send TOGGLE_CHANGED:', err);
        });
      }
    });
  });
}

if (finalizeAuditBtn) {
  finalizeAuditBtn.addEventListener('click', async () => {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (!tabs[0]) return;
      const sessionId = tabs[0].id.toString();

      addMessage('Checking for unresolved strategic conflicts...', 'system', '🕵️');
      
      try {
        const cResp = await fetch(`${AUDITOR_HTTP}/audit/session/${sessionId}`);
        const sessionState = await cResp.json();
        const conflicts = sessionState.unresolved_flags || [];

        if (conflicts && conflicts.length > 0) {
          addMessage(`Found ${conflicts.length} conflicts. Resolve them before finalizing.`, 'system', '⚖️');
          speak("I found unresolved conflicts. Please tell me which path is canonical.");
          
          conflicts.forEach(c => {
            const div = document.createElement('div');
            div.className = 'message error conflict-resolution';
            div.innerHTML = `
              <div class="conflict-card" style="background: rgba(255,0,0,0.1); padding: 10px; border: 1px solid var(--bubble-pink); border-radius: 4px; margin-top: 8px;">
                <p><strong>CONFLICT:</strong> ${c.contradiction}</p>
                <p class="dim" style="font-size:0.7rem;">Context: ${c.context}</p>
                <input type="text" placeholder="The canonical answer is..." style="width:100%; padding:6px; margin-top:8px; background:rgba(0,0,0,0.2); border:1px solid var(--border-color); color:white;">
                <button class="btn primary resolve-btn" style="width:100%; margin-top:8px;">SET AS CANONICAL</button>
              </div>
            `;
            messagesList.appendChild(div);
            messagesArea.scrollTop = messagesArea.scrollHeight;
            
            div.querySelector('.resolve-btn').onclick = async () => {
              const resolution = div.querySelector('input').value;
              if (!resolution) return;
              
              await fetch(`${AUDITOR_HTTP}/audit/resolve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  message: { role: 'user', content: `${c.id}|${resolution}` },
                  cbh_context: cbhContextInput.value || "",
                  session_id: sessionId
                })
              });
              
              div.innerHTML = `<p style="color:var(--avo-green); margin:0;">✅ Canonical Answer Recorded: ${resolution}</p>`;
              setTimeout(() => {
                div.remove();
                if (!messagesList.querySelector('.conflict-resolution')) {
                  addMessage('All conflicts resolved. Click FINALIZE again to generate doc.', 'system', '✅');
                }
              }, 3000);
            };
          });
          return;
        }

        // Finalize Logic
        addMessage('Generating Final Canonical Alignment Document...', 'system', '📜');
        speak("Finalizing. Generating your canonical document now.");
        
        const resp = await fetch(`${AUDITOR_HTTP}/audit/finalize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            thread_messages: Array.from(messagesList.querySelectorAll('.message:not(.system)')).map(msg => ({
              role: msg.classList.contains('user') ? 'user' : 'assistant',
              content: msg.querySelector('.msg-text')?.textContent || ""
            })),
            cbh_context: cbhContextInput.value || "Default: Stay on task.",
            session_id: sessionId
          })
        });
        const res = await resp.json();
        
        if (res.document) {
          const div = document.createElement('div');
          div.className = 'message system canonical-doc';
          div.innerHTML = `
            <div class="doc-card" style="background: rgba(255,255,255,0.05); padding: 12px; border: 2px solid var(--avo-green); border-radius: 8px; margin-top: 10px;">
              <h3 style="color:var(--avo-green); margin-top:0;">📜 CANONICAL DOCUMENT</h3>
              <pre style="white-space: pre-wrap; font-family: 'Courier Prime', monospace; font-size: 0.8rem;">${escapeHtml(res.document)}</pre>
              <button id="download-doc" class="btn primary" style="width:100%; margin-top:10px;">SAVE TO PERMANENT LOGS</button>
            </div>
          `;
          messagesList.appendChild(div);
          messagesArea.scrollTop = messagesArea.scrollHeight;
          speak("Canonical document generated. Review and save to your logs.");

          div.querySelector('#download-doc').onclick = () => {
            chrome.runtime.sendMessage({
              type: 'LOG_COMPLIANCE',
              data: {
                type: 'FINAL_DOC',
                content: res.document,
                metadata: { session_id: sessionId }
              }
            });
            addMessage('Document saved to permanent logs.', 'system', '💾');
            speak("Document saved.");
          };
        }
      } catch (err) {
        addMessage(`Process failed: ${err.message}`, 'error');
      }
    });
  });
}

const nudgeImg = document.getElementById('nudge-img');
const nudgeVideo = document.getElementById('nudge-video');
const overlayBg = document.getElementById('overlay-bg');
const bgVideo = document.getElementById('bg-video');
const nudgeCategoryBadge = document.getElementById('nudge-category-badge');
const nudgeDetailTitle = document.getElementById('nudge-detail-title');
const nudgeDetailMessage = document.getElementById('nudge-detail-message');
const nudgeDetailWhy = document.getElementById('nudge-detail-why');
const nudgeDismiss = document.getElementById('nudge-dismiss');
const nudgeActBtn = document.getElementById('nudge-act-btn');
const nudgeSnoozeBtn = document.getElementById('nudge-snooze-btn');
const visionBtn = document.getElementById('vision-btn');
const voiceToggleBtn = document.getElementById('voice-toggle-btn');

const modeTabs = document.querySelectorAll('.mode-tab');
const avatarUrlInput = document.getElementById('avatar-url-input');
const voiceSelect = document.getElementById('voice-select');
const voiceProviderSelect = document.getElementById('voice-provider-select');
const elevenApiKeyInput = document.getElementById('eleven-api-key');
const elevenVoiceIdInput = document.getElementById('eleven-voice-id');
const elevenConfigDiv = document.getElementById('elevenlabs-config');
const browserConfigDiv = document.getElementById('browser-voice-config');
const lofiModeToggle = document.getElementById('lofi-mode-toggle');
const driftDetectionToggle = document.getElementById('drift-detection-toggle');
const cbhContextInput = document.getElementById('cbh-context-input');
const saveSettingsBtn = document.getElementById('save-settings');

// === State ===
let ws = null;
let voiceEnabled = true;

// Prioritize high-quality voices to avoid robotic sound
function getBestVoice(voices) {
  const preferred = [
    'Google UK English Female', 
    'Google US English', 
    'Microsoft Samantha', 
    'Microsoft Zira', 
    'Alex'
  ];
  for (const name of preferred) {
    const v = voices.find(v => v.name.includes(name));
    if (v) return v;
  }
  return voices[0];
}

function toggleVoiceConfigUI(provider) {
  if (provider === 'elevenlabs') {
    elevenConfigDiv.classList.remove('hidden');
    browserConfigDiv.classList.add('hidden');
  } else {
    elevenConfigDiv.classList.add('hidden');
    browserConfigDiv.classList.remove('hidden');
  }
}

voiceProviderSelect.addEventListener('change', (e) => toggleVoiceConfigUI(e.target.value));

function saveSettings() {
  const avatarUrl = avatarUrlInput.value.trim();
  const selectedVoice = voiceSelect.value;
  const voiceProvider = voiceProviderSelect.value;
  const elevenApiKey = elevenApiKeyInput.value.trim();
  const elevenVoiceId = elevenVoiceIdInput.value.trim();
  const lofiMode = lofiModeToggle.checked;
  const driftEnabled = driftDetectionToggle.checked;
  const realtimeRecord = realtimeRecordToggle.checked;
  const hideHistory = hideHistoryToggle.checked;
  const cbhContext = cbhContextInput.value.trim();
  
  chrome.storage.sync.set({
    avatarUrl,
    selectedVoice,
    voiceProvider,
    elevenApiKey,
    elevenVoiceId,
    lofiMode
  });

  chrome.storage.local.set({
    drift_detection_enabled: driftEnabled,
    realtime_record_enabled: realtimeRecord,
    hide_history_enabled: hideHistory,
    cbh_context: cbhContext
  }, () => {
    addMessage('Settings saved and synchronized.', 'system');
    
    // Notify active tab of all current states
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { 
          type: 'SETTINGS_UPDATED', 
          avatarUrl,
          lofiMode
        }).catch(() => {});
        
        chrome.tabs.sendMessage(tabs[0].id, { 
          type: 'TOGGLE_CHANGED', 
          realtimeRecord,
          hideHistory
        }).catch(() => {});
      }
    });
  });
}

saveSettingsBtn.addEventListener('click', saveSettings);

function updateLofiMode(enabled) {
  if (enabled) {
    overlayBg.classList.remove('hidden');
    bgVideo.src = 'gifs/loop.mp4';
    bgVideo.play().catch(e => console.log('LoFi play failed:', e));
  } else {
    overlayBg.classList.add('hidden');
    bgVideo.pause();
  }
}

lofiModeToggle.addEventListener('change', (e) => {
  updateLofiMode(e.target.checked);
  chrome.storage.sync.set({ lofiMode: e.target.checked });
});

function populateVoiceList() {
  const voices = speechSynthesis.getVoices();
  if (voices.length === 0) return;

  const currentSelection = voiceSelect.value;
  voiceSelect.innerHTML = '';

  voices.forEach(voice => {
    const option = document.createElement('option');
    option.value = voice.name;
    option.textContent = `${voice.name} (${voice.lang})`;
    voiceSelect.appendChild(option);
  });

  if (!currentSelection) {
    const best = getBestVoice(voices);
    if (best) voiceSelect.value = best.name;
  } else {
    voiceSelect.value = currentSelection;
  }
}

// === TTS Logic ===
async function speak(text) {
  if (!voiceEnabled) return;

  chrome.storage.sync.get(['voiceProvider', 'elevenApiKey', 'elevenVoiceId', 'selectedVoice'], async (data) => {
    if (data.voiceProvider === 'elevenlabs' && data.elevenApiKey) {
      try {
        await speakElevenLabs(text, data.elevenApiKey, data.elevenVoiceId);
      } catch (err) {
        console.error('ElevenLabs failed, falling back to browser TTS:', err);
        speakBrowser(text, data.selectedVoice);
      }
    } else {
      speakBrowser(text, data.selectedVoice);
    }
  });
}

async function speakElevenLabs(text, apiKey, voiceId) {
  const vId = voiceId || 'pNInz6obpg8ndOeDr7qn'; // Default: Josh
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${vId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey
    },
    body: JSON.stringify({
      text: text,
      model_id: 'eleven_monolingual_v1',
      voice_settings: { stability: 0.5, similarity_boost: 0.5 }
    })
  });

  if (!response.ok) throw new Error(`ElevenLabs API error: ${response.status}`);

  const audioBlob = await response.blob();
  const audioUrl = URL.createObjectURL(audioBlob);
  const audio = new Audio(audioUrl);
  audio.play();
}

function speakBrowser(text, selectedName) {
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const voices = speechSynthesis.getVoices();
  const targetVoice = voices.find(v => v.name === selectedName);

  if (targetVoice) utterance.voice = targetVoice;
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  speechSynthesis.speak(utterance);
}

function updateVoiceToggleUI() {
  voiceToggleBtn.textContent = voiceEnabled ? '🔊' : '🔇';
  voiceToggleBtn.title = voiceEnabled ? 'Mute Voice' : 'Unmute Voice';
  voiceToggleBtn.classList.toggle('muted', !voiceEnabled);
}

voiceToggleBtn.addEventListener('click', () => {
  voiceEnabled = !voiceEnabled;
  updateVoiceToggleUI();
  chrome.storage.sync.set({ voiceEnabled: voiceEnabled });
  
  if (!voiceEnabled) {
    speechSynthesis.cancel(); // Stop current speech if muting
  }
});

// Refresh voices list when they change
if (speechSynthesis.onvoiceschanged !== undefined) {
  speechSynthesis.onvoiceschanged = populateVoiceList;
}
populateVoiceList();

// === Vision ===
visionBtn.addEventListener('click', () => {
  addMessage('Capturing screen...', 'system');
  chrome.runtime.sendMessage({ type: 'CAPTURE_SCREEN' }, (response) => {
    if (response && response.success && response.dataUrl) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          action: 'vision_dump',
          text: 'Analyze this screenshot and tell me if anything drifts from our core rules.',
          image: response.dataUrl
        }));
        addMessage('Screen captured and sent to Boss for analysis.', 'user', 'Vision');
        speak("Screen captured. Analyzing for drift.");
      } else {
        addMessage('Not connected to Boss. Screenshot failed.', 'error');
      }
    } else {
      addMessage(`Failed to capture screen: ${response?.error || 'Check permissions.'}`, 'error');
    }
  });
});

// === Clipboard Paste Handling ===
commandInput.addEventListener('paste', (e) => {
  const items = (e.clipboardData || e.originalEvent.clipboardData).items;
  for (let index in items) {
    const item = items[index];
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const blob = item.getAsFile();
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target.result;
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            action: 'vision_dump',
            text: 'Image pasted from clipboard.',
            image: dataUrl
          }));
          addMessage('Image pasted and sent to Boss.', 'user', 'Clipboard');
          speak("Image received from clipboard.");
        } else {
          addMessage('Not connected. Paste ignored.', 'error');
        }
      };
      reader.readAsDataURL(blob);
    }
  }
});


function addMessage(text, type = 'system', label = '') {
  const div = document.createElement('div');
  div.className = `message ${type}`;
  
  // Handle hide history logic
  if (hideHistoryToggle && hideHistoryToggle.checked && type !== 'error' && type !== 'system' && label !== 'Conflict') {
    div.classList.add('hidden-by-history');
  }

  let html = '';
  if (label) html += `<span class="msg-label">${label}</span>`;
  html += `<span class="msg-text">${escapeHtml(text)}</span>`;
  html += `<span class="msg-time">${new Date().toLocaleTimeString()}</span>`;
  div.innerHTML = html;
  messagesList.appendChild(div);
  messagesArea.scrollTop = messagesArea.scrollHeight;
  
  // Cleanup old hidden messages if too many
  const hiddenMsgs = messagesList.querySelectorAll('.hidden-by-history');
  if (hiddenMsgs.length > 50) {
    hiddenMsgs[0].remove();
  }
}


function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// === Compliance Logs ===
const refreshLogsBtn = document.getElementById('refresh-logs');
const logsList = document.getElementById('compliance-logs-list');

let showAllLogs = false;

async function fetchLogs() {
  logsList.innerHTML = '<p class="dim" style="text-align:center; padding: 20px;">Checking strategic alignment...</p>';
  // Default filter: only show high-priority alerts unless showAllLogs is true
  const queryParams = showAllLogs ? 'select=*&order=timestamp.desc&limit=50' : 'type=in.(CORRECTION,CONFLICT)&select=*&order=timestamp.desc&limit=20';
  
  chrome.runtime.sendMessage({ type: 'FETCH_LOGS', queryParams }, (response) => {
    if (response && response.success) {
      displayLogs(response.logs);
    } else {
      logsList.innerHTML = `<p class="error">Failed to fetch: ${response ? response.error : 'Unknown error'}</p>`;
    }
  });
}

// Add a toggle button to the UI if not already there
const logsHeader = document.querySelector('#mode-compliance h3');
if (logsHeader && !document.getElementById('toggle-all-logs')) {
  const toggleBtn = document.createElement('button');
  toggleBtn.id = 'toggle-all-logs';
  toggleBtn.className = 'btn';
  toggleBtn.style.fontSize = '0.6rem';
  toggleBtn.style.padding = '2px 6px';
  toggleBtn.style.marginLeft = '10px';
  toggleBtn.textContent = 'Show All Actions';
  toggleBtn.onclick = () => {
    showAllLogs = !showAllLogs;
    toggleBtn.textContent = showAllLogs ? 'Show Strategic Only' : 'Show All Actions';
    fetchLogs();
  };
  logsHeader.appendChild(toggleBtn);
}

function displayLogs(logs) {
  if (!logs || logs.length === 0) {
    logsList.innerHTML = '<p class="dim" style="text-align:center; padding: 20px;">No logs found in this session.</p>';
    return;
  }
  
  logsList.innerHTML = '';
  logs.forEach(log => {
    const item = document.createElement('div');
    item.className = 'log-item';
    
    const time = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const agentName = log.metadata?.agent || log.metadata?.source || (log.is_user_input ? 'USER' : 'AI');
    
    // retro colors based on type
    const colors = {
      'CORRECTION': '#FF6EB4', // pink
      'DECISION': '#D35400',   // orange
      'APPROVAL': '#568203',   // green
      'CONFLICT': '#FFDB58'    // yellow
    };
    const typeColor = colors[log.type] || 'var(--text-primary)';
    
    item.innerHTML = `
      <div class="log-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 4px;">
        <span class="log-agent" style="font-size: 0.6rem; font-weight: 900; background: #5D4037; color: #FFFDD0; padding: 1px 4px; border-radius: 2px;">${agentName.toUpperCase()}</span>
        <span class="log-time" style="font-size:0.6rem; opacity: 0.6;">${time}</span>
      </div>
      <div style="display:flex; align-items: flex-start; gap: 8px;">
        <span class="log-type-dot" style="width: 8px; height: 8px; border-radius: 50%; background: ${typeColor}; margin-top: 4px; flex-shrink: 0;"></span>
        <div class="log-body">
          <div class="log-type-label" style="font-size: 0.7rem; font-weight: bold; color: ${typeColor}; margin-bottom: 2px;">${log.type}</div>
          <div class="log-content" style="font-size: 0.85rem; line-height: 1.2; word-break: break-word;">
            ${escapeHtml(log.content)}
          </div>
        </div>
      </div>
    `;
    logsList.appendChild(item);
  });
}

refreshLogsBtn.addEventListener('click', fetchLogs);

// === Mode Tabs ===
modeTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    modeTabs.forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.mode-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    const mode = tab.dataset.mode;
    document.getElementById(`mode-${mode}`).classList.add('active');
    
    if (mode === 'compliance') {
      fetchLogs();
    }
  });
});

// === WebSocket ===
function connectWebSocket() {
  wsStatus.className = 'status-dot connecting';
  wsLabel.textContent = 'Connecting…';

  ws = new WebSocket(OPENCLAW_WS);

  ws.onopen = () => {
    wsStatus.className = 'status-dot connected';
    wsLabel.textContent = 'Online';
    addMessage('Connected to OpenClaw.', 'system');
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleServerEvent(data);
    } catch (e) {
      console.error('Failed to parse WS message', e);
    }
  };

  ws.onclose = () => {
    wsStatus.className = 'status-dot disconnected';
    wsLabel.textContent = 'Offline';
    setTimeout(connectWebSocket, 5000);
  };

  ws.onerror = () => {
    wsStatus.className = 'status-dot disconnected';
    wsLabel.textContent = 'Error';
  };
}

// === Handle Events from Server ===
function handleServerEvent(data) {
  // Chat / command response
  if (data.action === 'chat_response' || data.type === 'chat_response') {
    const text = data.text || data.message || '';
    addMessage(text, 'bot', 'Boss');
    speak(text);

    // Trigger Audit for AI Response
    auditLatestTurn('assistant', text);
  }

  // Brain dump confirmation
  if (data.action === 'dump_confirmed' || data.type === 'dump_confirmed') {
    addMessage(data.text || 'Brain dump indexed.', 'braindump-confirm');
  }

  // Nudge (any category)
  if (data.type === 'NUDGE' || data.category) {
    showNudge(data);
    // Forward to content script companion
    chrome.runtime.sendMessage(data).catch(() => {});
  }
}

// === Nudge Display ===
function showNudge(data) {
  const category = data.category || 'focus';
  nudgeDetail.classList.remove('hidden');

  // Asset selection
  const imgUrl = `gifs/${category}.png`;
  const videoUrl = `gifs/${category}.mp4`;

  // Default to image
  nudgeImg.classList.remove('hidden');
  nudgeVideo.classList.add('hidden');
  nudgeImg.src = imgUrl;
  nudgeImg.onerror = () => { 
    // Try video if image fails, or fallback to default
    nudgeImg.src = 'gifs/default.png'; 
  };

  // Badge
  nudgeCategoryBadge.textContent = category;
  nudgeCategoryBadge.className = `badge ${category}`;

  // Text
  nudgeDetailTitle.textContent = data.title || category.toUpperCase();
  nudgeDetailMessage.textContent = data.message || data.recommended_move || '';
  nudgeDetailWhy.textContent = data.why_it_matters || '';

  // Announce
  speak(`${category} check. ${data.title || ''}`);

  // Also add to chat history
  addMessage(`[${category.toUpperCase()}] ${data.title || ''}: ${data.message || ''}`, 'system');
}

// === Nudge Actions ===
nudgeDismiss.addEventListener('click', () => {
  nudgeDetail.classList.add('hidden');
});

nudgeActBtn.addEventListener('click', () => {
  nudgeDetail.classList.add('hidden');
  addMessage('Nudge acknowledged. Back on it.', 'system');
});

nudgeSnoozeBtn.addEventListener('click', () => {
  nudgeDetail.classList.add('hidden');
  addMessage('Snoozed for 15 minutes.', 'system');
  // Re-trigger the nudge in 15 minutes via alarm
  chrome.runtime.sendMessage({
    type: 'SET_REMINDER',
    title: nudgeDetailTitle.textContent,
    text: nudgeDetailMessage.textContent,
    delayMs: 15 * 60 * 1000
  });
});

// === Send Command to Boss ===
commandSend.addEventListener('click', () => {
  const text = commandInput.value.trim();
  if (!text) return;
  addMessage(text, 'user', 'You');
  commandInput.value = '';

  // Send via WebSocket for real-time
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ action: 'brain_dump', text: text }));
  }

  // Trigger Audit for User Message
  auditLatestTurn('user', text);

  // Also POST to /api/command
  fetch(`${OPENCLAW_HTTP}/api/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: text, source: 'extension' })
  }).catch(err => console.warn('HTTP command failed:', err));

  // Intercept commands for local handling
  const lower = text.toLowerCase();
  
  // 1. Reminders
  if (lower.includes('remind me') || lower.includes('nudge me')) {
    handleReminderRequest(text);
  }

  // 2. Avatar changes: "change avatar to http://..."
  const avatarMatch = lower.match(/(?:change|set) avatar (?:to )?(https?:\/\/\S+)/);
  if (avatarMatch) {
    const newUrl = avatarMatch[1];
    chrome.storage.sync.set({ avatarUrl: newUrl }, () => {
      chrome.runtime.sendMessage({ type: 'SETTINGS_UPDATED', avatarUrl: newUrl });
      addMessage(`Avatar updated to: ${newUrl}`, 'system', '🖼️');
      speak("New look! I've updated your companion avatar.");
    });
  }

  // 3. Voice Toggle: "voice off", "mute", "voice on", "unmute"
  if (lower === 'voice off' || lower === 'mute') {
    voiceEnabled = false;
    updateVoiceToggleUI();
    chrome.storage.sync.set({ voiceEnabled: false });
    speechSynthesis.cancel();
    addMessage('Voice muted.', 'system', '🔇');
    return; // Stop further processing
  } else if (lower === 'voice on' || lower === 'unmute') {
    voiceEnabled = true;
    updateVoiceToggleUI();
    chrome.storage.sync.set({ voiceEnabled: true });
    addMessage('Voice enabled.', 'system', '🔊');
    speak("I'm back! Voice is now enabled.");
    return; // Stop further processing
  }

  // 4. Voice Selection: "change voice to Google US English"
  const voiceMatch = lower.match(/(?:change|set) voice to (.+)/);
  if (voiceMatch) {
    const targetName = voiceMatch[1].trim();
    const voices = speechSynthesis.getVoices();
    const found = voices.find(v => v.name.toLowerCase().includes(targetName.toLowerCase()));
    if (found) {
      voiceSelect.value = found.name;
      chrome.storage.sync.set({ selectedVoice: found.name });
      addMessage(`Voice set to: ${found.name}`, 'system', '🗣️');
      speak(`How do I sound now? Voice changed to ${found.name}.`);
    } else {
      addMessage(`Could not find a voice named "${targetName}".`, 'error');
    }
  }

  // 5. Nudge Frequency
  const freqMatch = lower.match(/(?:set|change) nudge frequency to every (\d+) (min|hour)/);
  if (freqMatch) {
    const val = parseInt(freqMatch[1]);
    const unit = freqMatch[2];
    addMessage(`Nudge frequency set to every ${val} ${unit}s.`, 'system', '⚙️');
    speak(`Understood. I'll keep the nudges coming every ${val} ${unit}s.`);
    handleReminderRequest(`Remind me to check in every ${val} ${unit}s`);
  }

  // 6. Clear Reminders: "stop all reminders", "clear alarms"
  if (lower.includes('stop all reminders') || lower.includes('clear alarms') || lower.includes('stop nudges')) {
    chrome.runtime.sendMessage({ type: 'CLEAR_REMINDERS' }, (response) => {
      addMessage('All active reminders and alarms cleared.', 'system', '🧹');
      speak("Cleared! I've stopped all scheduled nudges.");
    });
  }
});

// Enter key to send command
commandInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commandSend.click(); }
});

// === Send Brain Dump ===
dumpSend.addEventListener('click', () => {
  const text = dumpInput.value.trim();
  if (!text) return;
  addMessage(text, 'user', 'Brain Dump');
  dumpInput.value = '';

  // POST to /api/brain-dump
  fetch(`${OPENCLAW_HTTP}/api/brain-dump`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: text,
      source: 'extension',
      timestamp: new Date().toISOString()
    })
  })
  .then(r => r.json())
  .then(data => {
    addMessage(data.confirmation || 'Brain dump saved & indexed.', 'braindump-confirm');
  })
  .catch(err => {
    // Fallback: send via WebSocket
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ action: 'brain_dump', text: text }));
    }
    addMessage('Dump sent via WebSocket (HTTP unavailable).', 'system');
  });
});

// === Send Reminder ===
reminderSend.addEventListener('click', () => {
  const text = reminderInput.value.trim();
  if (!text) return;
  handleReminderRequest(text);
  reminderInput.value = '';
});

function handleReminderRequest(text) {
  const delayInfo = parseReminderDelay(text);
  
  if (delayInfo) {
    const { delayMs, isRecurring, label } = delayInfo;
    
    chrome.runtime.sendMessage({
      type: 'SET_REMINDER',
      title: 'Agent Reminder',
      text: text.replace(/remind me\s+(to\s+)?/i, '').replace(/in\s+\d+\s*\w+/i, '').replace(/every\s+\d+\s*\w+/i, '').trim(),
      delayMs: delayMs,
      isRecurring: isRecurring
    }, (response) => {
      const typeLabel = isRecurring ? `every ${label}` : `in ${label}`;
      addMessage(`Reminder set: ${typeLabel}`, 'system', '⏰');
      speak(`Got it. I'll remind you ${typeLabel}.`);
    });
  } else {
    addMessage('Could not parse reminder time. Try "in 10 mins" or "every 30 mins".', 'error');
  }
}

// === Reminder Parsing ===
function parseReminderDelay(text) {
  const lower = text.toLowerCase();
  
  // Recurring pattern: "every 30 mins"
  let match = lower.match(/every\s+(\d+)\s*(min|hour)/);
  if (match) {
    const val = parseInt(match[1]);
    const unit = match[2];
    const ms = unit.startsWith('min') ? val * 60 * 1000 : val * 60 * 60 * 1000;
    return { delayMs: ms, isRecurring: true, label: `${val} ${unit}s` };
  }

  // One-off pattern: "in 10 mins"
  match = lower.match(/in\s+(\d+)\s*(min|hour)/);
  if (match) {
    const val = parseInt(match[1]);
    const unit = match[2];
    const ms = unit.startsWith('min') ? val * 60 * 1000 : val * 60 * 60 * 1000;
    return { delayMs: ms, isRecurring: false, label: `${val} ${unit}s` };
  }

  // Time pattern: "at 5:30pm"
  match = lower.match(/at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)/);
  if (match) {
    let h = parseInt(match[1]);
    const m = parseInt(match[2] || '0');
    const ampm = match[3];
    if (ampm === 'pm' && h !== 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
    const now = new Date();
    const target = new Date(now);
    target.setHours(h, m, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);
    return { delayMs: target - now, isRecurring: false, label: `at ${h}:${m}${ampm}` };
  }
  
  return null;
}

function formatDelay(ms) {
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins} minute${mins !== 1 ? 's' : ''}`;
  const hrs = Math.round(mins / 60);
  return `${hrs} hour${hrs !== 1 ? 's' : ''}`;
}

// === Listen for messages from background (reminder alarms) ===
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'NUDGE') {
    showNudge(message);
  }
});

// === Deep Sync (DO Spaces Archival) ===
if (deepSyncBtn) {
  deepSyncBtn.addEventListener('click', () => {
    addMessage('Preparing deep sync archival...', 'system', '🧠');
    
    // 1. Collect session history
    const history = [];
    const messageElements = messagesList.querySelectorAll('.message');
    messageElements.forEach(el => {
      const text = el.querySelector('.msg-text')?.textContent || '';
      const time = el.querySelector('.msg-time')?.textContent || '';
      const label = el.querySelector('.msg-label')?.textContent || '';
      const type = el.className.replace('message ', '');
      history.push({ type, label, text, time });
    });

    // 2. Add current strategic logs for full context
    chrome.runtime.sendMessage({ type: 'FETCH_LOGS', queryParams: 'select=*&order=timestamp.desc&limit=100' }, (response) => {
      const fullSessionData = {
        timestamp: new Date().toISOString(),
        chat_history: history,
        strategic_logs: response?.logs || [],
        source_url: window.location.href,
        metadata: {
          project: "Clawmander Snitch",
          tier: "Deep Memory"
        }
      };

      // 3. Send to background for DO Spaces upload
      chrome.runtime.sendMessage({ 
        type: 'DEEP_SYNC', 
        data: fullSessionData 
      }, (res) => {
        if (res && res.success) {
          addMessage(`Archived to sessions/ folder: ${res.fileName}`, 'system', '📦');
          speak("Session archived to your deep memory bucket.");
        } else {
          addMessage(`Archival failed: ${res?.error || 'Unknown error'}`, 'error');
        }
      });
    });
  });
}

// === Deep Audit (Strategic Drift Detection) ===
if (deepAuditBtn) {
  deepAuditBtn.addEventListener('click', () => {
    addMessage('Starting deep strategic audit...', 'system', '🔍');
    speak("Stand by. I'm auditing the full thread for strategic drift.");
    
    chrome.runtime.sendMessage({ type: 'RUN_DEEP_AUDIT' }, (response) => {
      if (response && response.success) {
        if (response.verdict.status === 'PASS') {
          addMessage('Audit Complete: No strategic drift detected. You are on the Golden Path.', 'system', '✅');
          speak("Audit complete. You are perfectly aligned.");
        } else {
          // Nudge is automatically shown by background/content handler
          addMessage(`Audit Flagged: ${response.verdict.violation_type}`, 'error', '🚨');
        }
      } else {
        addMessage(`Audit failed: ${response?.error || 'Unknown error'}`, 'error');
      }
    });
  });
}

// === Init ===
loadSettings();
connectWebSocket();
