// background.js — Clawmander Snitch Service Worker
// No telemetry. No surveillance. Just message routing and compliance enforcement.

const SUPABASE_URL = "https://uhaztkjcdefkbypklzif.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVoYXp0a2pjZGVma2J5cGtsemlmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Nzg5NzY3NiwiZXhwIjoyMDkzNDczNjc2fQ.j1W9OU_oHDPQJXAJPMJNGzCob-jKTGv0nUhiFSmA3vk";

// Set side panel behavior to open on click
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('Error setting side panel behavior:', error));

// Message routing hub
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  
  // Compliance Logging (to Supabase)
  if (message.type === 'LOG_COMPLIANCE') {
    const logData = {
      type: message.data.type,
      content: message.data.content,
      source_url: sender.tab ? sender.tab.url : 'extension',
      is_user_input: message.data.is_user_input ?? true,
      metadata: {
        ...message.data.metadata,
        source: message.data.source || 'browser_extension'
      }
    };
    
    fetch(`${SUPABASE_URL}/rest/v1/session_log`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(logData)
    })
    .then(resp => {
      if (!resp.ok) throw new Error(`Supabase error: ${resp.statusText}`);
      sendResponse({ success: true });
    })
    .catch(err => {
      console.error('Compliance log failed:', err);
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  // Deep Auditor Logic (Full Thread Analysis)
  if (message.type === 'RUN_DEEP_AUDIT') {
    const processAudit = (thread, tabId) => {
      chrome.storage.local.get(['cbh_context'], (data) => {
        const cbh = data.cbh_context || "Default Rule: Stay on task and follow the project plan.";
        
        fetch('http://137.184.235.85:8000/audit/thread', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            thread_messages: thread,
            cbh_context: cbh,
            session_id: tabId.toString()
          })
        })
        .then(resp => resp.json())
        .then(results => {
          // 'results' is now expected to be { notes: [], flags: [] }
          if (results.flags && results.flags.length > 0) {
            results.flags.forEach(flag => {
              const nudge = {
                type: 'NUDGE',
                category: 'compliance',
                title: flag.contradiction,
                message: flag.resolution,
                severity: flag.severity,
                id: flag.id
              };
              
              // Broadcast nudge to the specific tab
              chrome.tabs.sendMessage(tabId, nudge).catch(() => {});
              chrome.runtime.sendMessage(nudge).catch(() => {});
            });
          }

          // Log notes to Supabase
          if (results.notes && results.notes.length > 0) {
            results.notes.forEach(note => {
              chrome.runtime.sendMessage({
                type: 'LOG_COMPLIANCE',
                data: {
                  type: 'CANONICAL_NOTE',
                  content: note.fact,
                  metadata: { importance: note.importance, note_id: note.id }
                }
              });
            });
          }

          sendResponse({ success: true, results });
        })
        .catch(err => {
          console.warn('Audit service offline:', err.message);
          sendResponse({ success: false, error: "Auditor offline. Start 'auditor_service.py'." });
        });
      });
    };

    if (message.thread) {
      // Thread provided by real-time scraper
      processAudit(message.thread, sender.tab.id);
    } else {
      // Manual trigger from side panel
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { type: 'SCRAPE_THREAD' }, (scrapeRes) => {
            if (scrapeRes && scrapeRes.success && scrapeRes.thread) {
              processAudit(scrapeRes.thread, tabs[0].id);
            } else {
              sendResponse({ success: false, error: "Could not scrape thread." });
            }
          });
        } else {
          sendResponse({ success: false, error: "No active tab." });
        }
      });
    }
    return true; // Async
  }

  // Real-time Auditor Logic (Single Turn)
  if (message.type === 'PERFORM_AUDIT') {
    chrome.storage.local.get(['cbh_context', 'drift_detection_enabled'], (data) => {
      if (!data.drift_detection_enabled) {
        return sendResponse({ success: true, status: 'DISABLED' });
      }

      const cbh = data.cbh_context || "Default Rule: Stay on task and follow the project plan.";
      
      // Use the dedicated /audit/turn endpoint for real-time turn analysis
      fetch('http://137.184.235.85:8000/audit/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: { role: 'user', content: message.text },
          cbh_context: cbh,
          session_id: 'realtime_session'
        })
      })
      .then(resp => resp.json())
      .then(verdict => {
        sendResponse({ success: true, verdict });
      })
      .catch(err => {
        console.warn('Real-time audit failed (Auditor likely offline):', err.message);
        sendResponse({ success: false, error: "Auditor offline. Start 'auditor_service.py' to enable drift detection." });
      });

    });
    return true;
  }

  // Route nudges from side panel (or WebSocket relay) to all content scripts
  if (message.type === 'NUDGE') {
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, message).catch(() => {});
      });
    });
  }

  // Set a reminder alarm
  if (message.type === 'SET_REMINDER') {
    const { title, text, delayMs } = message;
    const alarmName = `reminder_${Date.now()}`;
    const delayInMinutes = Math.max(delayMs / 60000, 0.1);
    
    const alarmOptions = {
      delayInMinutes: delayInMinutes
    };
    if (message.isRecurring) {
      alarmOptions.periodInMinutes = delayInMinutes;
    }

    chrome.alarms.create(alarmName, alarmOptions);

    chrome.storage.local.get('reminders', (data) => {
      const reminders = data.reminders || {};
      reminders[alarmName] = {
        title: title,
        message: text,
        isRecurring: message.isRecurring,
        created: new Date().toISOString()
      };
      chrome.storage.local.set({ reminders });
    });

    sendResponse({ status: 'alarm_set', alarmName });
  }
  
  // Clear all reminders
  if (message.type === 'CLEAR_REMINDERS') {
    chrome.alarms.clearAll(() => {
      chrome.storage.local.set({ reminders: {} }, () => {
        sendResponse({ status: 'cleared' });
      });
    });
    return true;
  }

  // Forward companion state changes
  if (message.type === 'COMPANION_STATE') {
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, message).catch(() => {});
      });
    });
  }

  // Open side panel
  if (message.type === 'OPEN_SIDE_PANEL') {
    chrome.sidePanel.open({ windowId: sender.tab.windowId })
      .catch((error) => {
        chrome.tabs.sendMessage(sender.tab.id, { 
          type: 'SIDE_PANEL_FAILURE', 
          error: error.message 
        }).catch(() => {});
      });
  }

  // Capture current tab
  if (message.type === 'CAPTURE_SCREEN') {
    // Using null as the first argument captures the active tab in the current window.
    chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 80 }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        const errMsg = chrome.runtime.lastError.message;
        console.error('Capture Error:', errMsg);
        sendResponse({ success: false, error: errMsg });
      } else {
        sendResponse({ success: true, dataUrl: dataUrl });
      }
    });
    return true;
  }


  // Fetch recent logs (for Side Panel)
  if (message.type === 'FETCH_LOGS') {
    const params = message.queryParams || 'select=*&order=timestamp.desc&limit=20';
    fetch(`${SUPABASE_URL}/rest/v1/session_log?${params}`, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    })
    .then(resp => resp.json())
    .then(data => sendResponse({ success: true, logs: data }))
    .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // Check for conflicts based on recent corrections
  if (message.type === 'CHECK_CONFLICTS') {
    fetch(`${SUPABASE_URL}/rest/v1/session_log?type=eq.CORRECTION&select=*&order=timestamp.desc&limit=5`, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    })
    .then(resp => resp.json())
    .then(corrections => {
      if (!Array.isArray(corrections)) return sendResponse({ success: true, hasConflict: false });
      const currentInput = message.text.toLowerCase();
      const conflicts = corrections.filter(c => {
        const content = c.content.toLowerCase();
        const keywords = content.split(/\s+/).filter(w => w.length > 4);
        return keywords.some(k => currentInput.includes(k));
      });
      sendResponse({ success: true, hasConflict: conflicts.length > 0, conflicts });
    })
    .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // Deep Sync to DO Spaces (Archival)
  if (message.type === 'DEEP_SYNC') {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `session_${timestamp}.json`;
    const folder = "sessions/";
    
    // We send this to the Droplet 1 which handles the DO Spaces upload
    // using the system-level Access Keys to keep them out of the browser.
    fetch(`${SUPABASE_URL.replace('uhaztkjcdefkbypklzif.supabase.co', '146.190.116.20:8081')}/api/archive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        folder: folder,
        fileName: fileName,
        data: message.data
      })
    })
    .then(resp => resp.json())
    .then(data => {
      if (data.success) {
        sendResponse({ success: true, fileName: fileName });
      } else {
        sendResponse({ success: false, error: data.error });
      }
    })
    .catch(err => sendResponse({ success: false, error: "Archive proxy not found on Droplet 1. Please start the 'Memory Porter' script." }));
    return true;
  }

  return true;
});

// Handle alarms
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name.startsWith('reminder_')) {
    chrome.storage.local.get('reminders', (data) => {
      const reminders = data.reminders || {};
      const reminder = reminders[alarm.name];

      if (reminder) {
        const nudge = {
          type: 'NUDGE',
          category: 'reminder',
          title: reminder.title || 'Reminder',
          message: reminder.message,
          timestamp: new Date().toISOString()
        };

        chrome.tabs.query({}, (tabs) => {
          tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, nudge).catch(() => {});
          });
        });

        chrome.runtime.sendMessage(nudge).catch(() => {});

        if (!reminder.isRecurring) {
          delete reminders[alarm.name];
          chrome.storage.local.set({ reminders });
        }
      }
    });
  }
});
