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
  const observer = new MutationObserver(() => {
    // Detect participant roster in Teams
    const meetingControls = document.querySelector('[data-tid="call-controls"]');
    const participantNodes = document.querySelectorAll('[data-tid="roster-item"]');

    if ((meetingControls || participantNodes.length > 0) && !currentMeetingId) {
      // Meeting started
      handleMeetingStart('teams');
    } else if (!meetingControls && participantNodes.length === 0 && currentMeetingId) {
      // Meeting ended
      handleMeetingEnd();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

function setupGoogleMeetDetection() {
  // Monitor for Google Meet meeting controls and participant list
  const observer = new MutationObserver(() => {
    // Use new, correct selector for controls
    const meetingControls = document.querySelector('.Tmb7Fd[aria-label="Call controls"]');
    const participantNodes = document.querySelectorAll('[data-participant-id]');

    if ((meetingControls || participantNodes.length > 0) && !currentMeetingId) {
      // Meeting started
      handleMeetingStart('googlemeet');
    } else if (!meetingControls && participantNodes.length === 0 && currentMeetingId) {
      // Meeting ended
      handleMeetingEnd();
    } else if (currentMeetingId) {
      // Meeting ongoing - check for participant changes
      const newParticipants = extractParticipants('googlemeet');
      if (newParticipants.length !== participants.length || 
          !newParticipants.every(p => participants.some(existing => existing.name === p.name))) {
        console.log('Participants changed:', newParticipants);
        participants = newParticipants;
        updateSmallTalk();
      }
    }
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
    if (response && response.error) {
      console.error('Error starting meeting:', response.error);
    } else if (response) {
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
    if (response && response.error) {
      console.error('Error ending meeting:', response.error);
    }
  });

  // Reset state
  currentMeetingId = null;
  participants = [];
  hideSmallTalkPanel();
}

function extractParticipants(platform) {
  const participantList = [];

  if (platform === 'teams') {
    // Extract participants from Teams UI
    const participantElements = document.querySelectorAll('[data-tid="roster-item"]');
    participantElements.forEach((element) => {
      const nameElement = element.querySelector('[data-tid="roster-item-name"]');
      if (nameElement) {
        participantList.push({
          name: nameElement.textContent.trim(),
          platform: 'teams'
        });
      }
    });
  } else if (platform === 'googlemeet') {
    console.log('Extracting Google Meet participants...');
    
    // Get participant elements
    const participantElements = document.querySelectorAll('[data-participant-id]');
    console.log('Found participant elements:', participantElements.length);
    
    participantElements.forEach(element => {
      // Look for name in aria-label first (most reliable)
      const ariaLabel = element.getAttribute('aria-label');
      console.log('Found aria-label:', ariaLabel);
      
      let cleanName = null;
      
      if (ariaLabel) {
        cleanName = extractNameFromAriaLabel(ariaLabel);
        console.log('Cleaned name from aria-label:', cleanName);
      }
      
      // Fallback to text content if aria-label doesn't work
      if (!cleanName) {
        const textContent = element.textContent;
        console.log('Trying text content:', textContent);
        cleanName = extractNameFromText(textContent);
        console.log('Cleaned name from text:', cleanName);
      }
      
      // Filter out current user (you) and add valid participants
      if (cleanName && 
          cleanName !== 'You' && 
          !cleanName.includes('Michael Hoole') && // Replace with your actual name
          !participantList.some(p => p.name === cleanName)) {
        participantList.push({
          name: cleanName,
          platform: 'googlemeet'
        });
        console.log('Added participant:', cleanName);
      } else {
        console.log('Filtered out participant:', cleanName);
      }
    });
  }

  console.log('Final extracted participants:', participantList);
  return participantList;
}

function extractNameFromAriaLabel(ariaLabel) {
  if (!ariaLabel || ariaLabel.length === 0) return null;
  
  let name = ariaLabel;
  name = name.replace(/\s*\([^)]*@[^)]*\)\s*/g, '').trim();
  
  const parts = name.split(/[\n\r\t,;]/);
  if (parts.length > 0) {
    name = parts[0].trim();
  }
  
  if (name.length >= 2 && name.length <= 30 && /^[a-zA-Z][a-zA-Z\s.'\-]*$/.test(name)) {
    return name;
  }
  
  return null;
}

function extractNameFromText(textContent) {
  if (!textContent) return null;
  
  console.log('Processing text content:', textContent);
  
  // Look for name patterns in the text
  // Common pattern: "KellyKellydevices" or "Michael HooleMichael Hooledevices"
  
  // Remove common UI suffixes
  let cleanText = textContent.replace(/devices?$/i, '').trim();
  
  // Look for repeated name patterns like "KellyKelly" -> "Kelly"
  const nameMatch = cleanText.match(/^([A-Z][a-z]+)\1/); // Matches "KellyKelly"
  if (nameMatch) {
    const name = nameMatch[1];
    console.log('Found repeated name pattern:', name);
    return name;
  }
  
  // Look for "FirstName LastNameFirstName LastName" pattern
  const fullNameMatch = cleanText.match(/^([A-Z][a-z]+ [A-Z][a-z]+)\1/); // Matches "Michael HooleMichael Hoole"
  if (fullNameMatch) {
    const name = fullNameMatch[1];
    console.log('Found repeated full name pattern:', name);
    return name;
  }
  
  // Fallback: look for any name-like text at the start
  const simpleNameMatch = cleanText.match(/^([A-Z][a-zA-Z\s.'\-]{1,29})/);
  if (simpleNameMatch) {
    let name = simpleNameMatch[1].trim();
    
    // Remove duplicate consecutive words
    const words = name.split(/\s+/);
    const uniqueWords = [];
    let lastWord = '';
    
    for (const word of words) {
      if (word.toLowerCase() !== lastWord.toLowerCase()) {
        uniqueWords.push(word);
        lastWord = word;
      }
    }
    
    name = uniqueWords.join(' ');
    console.log('Found simple name:', name);
    return name;
  }
  
  return null;
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

function updateSmallTalk() {
  if (!currentMeetingId || participants.length === 0) return;
  
  chrome.runtime.sendMessage({
    action: 'getSmallTalk',
    data: {
      participants: participants
    }
  }, (response) => {
    if (response && response.smallTalk) {
      displaySmallTalk(response.smallTalk);
    }
  });
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
    case 'startPageRecording':
      startPageRecording(request.meetingId);
      sendResponse({ success: true });
      break;
    case 'stopPageRecording':
      stopPageRecording();
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

// Inject recording script into page
function startPageRecording(meetingId) {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('inject-recorder.js');
  script.onload = () => {
    window.postMessage({ type: 'START_RECORDING', meetingId: meetingId }, '*');
    document.head.removeChild(script);
  };
  document.head.appendChild(script);
}

function stopPageRecording() {
  window.postMessage({ type: 'STOP_RECORDING' }, '*');
}

// Listen for messages from injected script
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  
  if (event.data.type === 'AUDIO_DATA') {
    try {
      chrome.runtime.sendMessage({
        action: 'audioData',
        data: {
          audioData: event.data.audioData,
          meetingId: event.data.meetingId
        }
      });
    } catch (error) {
      if (error.message.includes('Extension context invalidated')) {
        console.log('Extension context invalidated, stopping audio recording');
        stopPageRecording();
      } else {
        console.error('Error sending audio data:', error);
      }
    }
  } else if (event.data.type === 'RECORDING_ERROR') {
    console.error('Recording error:', event.data.error);
  }
});


