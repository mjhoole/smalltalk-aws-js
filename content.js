// content.js - Content script for Teams and Google Meet integration

let smallTalkPanel = null;
let consentDialog = null;
let currentMeetingId = null;
let participants = [];

// Initialize when page loads
document.addEventListener('DOMContentLoaded', initializeSmallTalkPro);

// Also initialize immediately in case DOM is already loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeSmallTalkPro);
} else {
  initializeSmallTalkPro();
}

function initializeSmallTalkPro() {
  console.log('SmallTalkPro initializing...');
  
  // Detect platform (Teams or Google Meet)
  const platform = detectPlatform();
  if (!platform) {
    console.log('Not on a supported platform');
    return;
  }
  
  console.log(`Detected platform: ${platform}`);
  
  // Set up observers for meeting detection
  setupMeetingDetection(platform);
  
  // Create small talk panel
  createSmallTalkPanel();
}

function detectPlatform() {
  const hostname = window.location.hostname;
  if (hostname.includes('teams.microsoft.com')) {
    return 'teams';
  } else if (hostname.includes('meet.google.com')) {
    return 'googlemeet';
  }
  return null;
}

function setupMeetingDetection(platform) {
  // Platform-specific meeting detection logic
  if (platform === 'teams') {
    setupTeamsMeetingDetection();
  } else if (platform === 'googlemeet') {
    setupGoogleMeetDetection();
  }
}

function setupTeamsMeetingDetection() {
  // Monitor for Teams meeting UI elements
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      // Look for meeting controls or participant list
      const meetingControls = document.querySelector('[data-tid="meeting-controls"]');
      const participantList = document.querySelector('[data-tid="roster-list"]');
      
      if (meetingControls && !currentMeetingId) {
        // Meeting started
        handleMeetingStart('teams');
      } else if (!meetingControls && currentMeetingId) {
        // Meeting ended
        handleMeetingEnd();
      }
    });
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

function setupGoogleMeetDetection() {
  // Monitor for Google Meet UI elements
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      // Look for meeting controls or participant list
      const meetingControls = document.querySelector('[data-call-controls]');
      const participantList = document.querySelector('[data-participant-id]');
      
      if (meetingControls && !currentMeetingId) {
        // Meeting started
        handleMeetingStart('googlemeet');
      } else if (!meetingControls && currentMeetingId) {
        // Meeting ended
        handleMeetingEnd();
      }
    });
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

function handleMeetingStart(platform) {
  console.log('Meeting started on', platform);
  
  // Generate meeting ID
  currentMeetingId = generateMeetingId();
  
  // Extract participants
  participants = extractParticipants(platform);
  
  // Notify background script
  chrome.runtime.sendMessage({
    action: 'startMeeting',
    data: {
      meetingId: currentMeetingId,
      platform: platform,
      participants: participants
    }
  }, (response) => {
    if (response.error) {
      console.error('Error starting meeting:', response.error);
    } else {
      displaySmallTalk(response.smallTalk);
    }
  });
}

function handleMeetingEnd() {
  console.log('Meeting ended');
  
  // Notify background script
  chrome.runtime.sendMessage({
    action: 'endMeeting',
    data: {
      meetingId: currentMeetingId
    }
  }, (response) => {
    if (response.error) {
      console.error('Error ending meeting:', response.error);
    }
  });
  
  // Reset state
  currentMeetingId = null;
  participants = [];
  hideSmallTalkPanel();
}

function extractParticipants(platform) {
  const participants = [];
  
  if (platform === 'teams') {
    // Extract participants from Teams UI
    const participantElements = document.querySelectorAll('[data-tid="roster-item"]');
    participantElements.forEach((element) => {
      const nameElement = element.querySelector('[data-tid="roster-item-name"]');
      if (nameElement) {
        participants.push({
          name: nameElement.textContent.trim(),
          platform: 'teams'
        });
      }
    });
  } else if (platform === 'googlemeet') {
    // Extract participants from Google Meet UI
    const participantElements = document.querySelectorAll('[data-participant-id]');
    participantElements.forEach((element) => {
      const nameElement = element.querySelector('[data-self-name], [data-participant-name]');
      if (nameElement) {
        participants.push({
          name: nameElement.textContent.trim(),
          platform: 'googlemeet'
        });
      }
    });
  }
  
  return participants;
}

function createSmallTalkPanel() {
  if (smallTalkPanel) return;
  
  smallTalkPanel = document.createElement('div');
  smallTalkPanel.id = 'smalltalk-panel';
  smallTalkPanel.className = 'smalltalk-panel hidden';
  
  smallTalkPanel.innerHTML = `
    <div class="smalltalk-header">
      <div class="smalltalk-logo">
        <span class="smalltalk-icon">💬</span>
        <span class="smalltalk-title">SmallTalkPro</span>
      </div>
      <button class="smalltalk-close" onclick="hideSmallTalkPanel()">×</button>
    </div>
    <div class="smalltalk-content">
      <div class="smalltalk-loading">
        <span>Loading conversation context...</span>
      </div>
      <div class="smalltalk-snippets"></div>
    </div>
  `;
  
  document.body.appendChild(smallTalkPanel);
}

function displaySmallTalk(smallTalkData) {
  if (!smallTalkPanel) return;
  
  const snippetsContainer = smallTalkPanel.querySelector('.smalltalk-snippets');
  const loadingElement = smallTalkPanel.querySelector('.smalltalk-loading');
  
  // Hide loading
  loadingElement.style.display = 'none';
  
  // Clear previous snippets
  snippetsContainer.innerHTML = '';
  
  if (!smallTalkData || smallTalkData.length === 0) {
    snippetsContainer.innerHTML = '<div class="no-snippets">No previous conversations found.</div>';
  } else {
    smallTalkData.forEach((snippet) => {
      const snippetElement = document.createElement('div');
      snippetElement.className = 'smalltalk-snippet';
      snippetElement.innerHTML = `
        <div class="snippet-participant">${snippet.participantName}</div>
        <div class="snippet-text">${snippet.text}</div>
        <div class="snippet-suggestion">💡 ${snippet.suggestion}</div>
      `;
      snippetsContainer.appendChild(snippetElement);
    });
  }
  
  // Show panel
  smallTalkPanel.classList.remove('hidden');
}

function hideSmallTalkPanel() {
  if (smallTalkPanel) {
    smallTalkPanel.classList.add('hidden');
  }
}

function generateMeetingId() {
  return 'meeting_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'requestConsent':
      showConsentDialog(request.participants, sendResponse);
      break;
    case 'newSmallTalk':
      addNewSmallTalkSnippet(request.data);
      sendResponse({ success: true });
      break;
    default:
      sendResponse({ error: 'Unknown action' });
  }
  return true;
});

function showConsentDialog(participants, sendResponse) {
  // Create consent dialog
  consentDialog = document.createElement('div');
  consentDialog.className = 'consent-dialog-overlay';
  
  consentDialog.innerHTML = `
    <div class="consent-dialog">
      <div class="consent-header">
        <h3>SmallTalkPro - Recording Consent</h3>
      </div>
      <div class="consent-content">
        <p>SmallTalkPro would like to record and analyze this meeting to identify small talk and improve future conversations.</p>
        <p><strong>Participants:</strong> ${participants.map(p => p.name).join(', ')}</p>
        <p>Your privacy is important to us. Recordings are processed securely and only small talk snippets are stored.</p>
        <div class="consent-actions">
          <button class="consent-deny">Deny</button>
          <button class="consent-allow">Allow Recording</button>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(consentDialog);
  
  // Handle consent response
  consentDialog.querySelector('.consent-allow').addEventListener('click', () => {
    document.body.removeChild(consentDialog);
    consentDialog = null;
    sendResponse({ granted: true });
  });
  
  consentDialog.querySelector('.consent-deny').addEventListener('click', () => {
    document.body.removeChild(consentDialog);
    consentDialog = null;
    sendResponse({ granted: false });
  });
}

function addNewSmallTalkSnippet(snippetData) {
  if (!smallTalkPanel) return;
  
  const snippetsContainer = smallTalkPanel.querySelector('.smalltalk-snippets');
  const snippetElement = document.createElement('div');
  snippetElement.className = 'smalltalk-snippet new-snippet';
  snippetElement.innerHTML = `
    <div class="snippet-participant">${snippetData.participantName}</div>
    <div class="snippet-text">${snippetData.text}</div>
    <div class="snippet-timestamp">Just now</div>
  `;
  
  snippetsContainer.insertBefore(snippetElement, snippetsContainer.firstChild);
  
  // Remove 'new' class after animation
  setTimeout(() => {
    snippetElement.classList.remove('new-snippet');
  }, 2000);
}

