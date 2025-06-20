// background.js - Service Worker for Chrome Extension

const API_BASE_URL = 'https://7m0j2avi6j.execute-api.ap-southeast-2.amazonaws.com'; // Replace with actual API Gateway URL
const WS_URL = 'wss://vbx2hmj6r3.execute-api.ap-southeast-2.amazonaws.com'; // Replace with actual WebSocket URL

let websocket = null;
let isRecording = false;

// Initialize extension
chrome.runtime.onInstalled.addListener(() => {
  console.log('SmallTalkPro extension installed');
});

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'startMeeting':
      handleStartMeeting(request.data, sendResponse);
      break;
    case 'endMeeting':
      handleEndMeeting(request.data, sendResponse);
      break;
    case 'getSmallTalk':
      handleGetSmallTalk(request.data, sendResponse);
      break;
    case 'requestConsent':
      handleRequestConsent(request.data, sendResponse);
      break;
    default:
      sendResponse({ error: 'Unknown action' });
  }
  return true; // Keep message channel open for async response
});

// Handle meeting start
async function handleStartMeeting(data, sendResponse) {
  try {
    // Connect to WebSocket
    await connectWebSocket();
    
    // Get user consent
    const consentGranted = await requestUserConsent(data.participants);
    if (!consentGranted) {
      sendResponse({ error: 'User consent not granted' });
      return;
    }

    // Start recording and transcription
    await startRecording(data.meetingId);
    
    // Get relevant small talk for participants
    const smallTalk = await getRelevantSmallTalk(data.participants);
    
    sendResponse({ 
      success: true, 
      smallTalk: smallTalk 
    });
  } catch (error) {
    console.error('Error starting meeting:', error);
    sendResponse({ error: error.message });
  }
}

// Handle meeting end
async function handleEndMeeting(data, sendResponse) {
  try {
    await stopRecording();
    if (websocket) {
      websocket.close();
      websocket = null;
    }
    sendResponse({ success: true });
  } catch (error) {
    console.error('Error ending meeting:', error);
    sendResponse({ error: error.message });
  }
}

// Connect to WebSocket for real-time communication
function connectWebSocket() {
  return new Promise((resolve, reject) => {
    websocket = new WebSocket(WS_URL);
    
    websocket.onopen = () => {
      console.log('WebSocket connected');
      resolve();
    };
    
    websocket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      handleWebSocketMessage(data);
    };
    
    websocket.onerror = (error) => {
      console.error('WebSocket error:', error);
      reject(error);
    };
    
    websocket.onclose = () => {
      console.log('WebSocket disconnected');
    };
  });
}

// Handle WebSocket messages
function handleWebSocketMessage(data) {
  switch (data.type) {
    case 'smallTalkIdentified':
      // Notify content script of new small talk
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: 'newSmallTalk',
            data: data.smallTalk
          });
        }
      });
      break;
    case 'transcriptionUpdate':
      // Handle real-time transcription updates
      console.log('Transcription update:', data.transcript);
      break;
  }
}

// Request user consent for recording
async function requestUserConsent(participants) {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'requestConsent',
          participants: participants
        }, (response) => {
          resolve(response && response.granted);
        });
      } else {
        resolve(false);
      }
    });
  });
}

// Start audio recording and transcription
async function startRecording(meetingId) {
  try {
    // Get microphone access
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // Set up MediaRecorder for audio capture
    const mediaRecorder = new MediaRecorder(stream);
    const audioChunks = [];
    
    mediaRecorder.ondataavailable = (event) => {
      audioChunks.push(event.data);
      
      // Send audio chunk to backend via WebSocket
      if (websocket && websocket.readyState === WebSocket.OPEN) {
        const reader = new FileReader();
        reader.onload = () => {
          websocket.send(JSON.stringify({
            action: 'ingestAudio',
            meetingId: meetingId,
            audioData: reader.result
          }));
        };
        reader.readAsArrayBuffer(event.data);
      }
    };
    
    mediaRecorder.start(1000); // Capture audio in 1-second chunks
    isRecording = true;
    
  } catch (error) {
    console.error('Error starting recording:', error);
    throw error;
  }
}

// Stop audio recording
async function stopRecording() {
  isRecording = false;
  // Additional cleanup logic here
}

// Get relevant small talk for meeting participants
async function getRelevantSmallTalk(participants) {
  try {
    const response = await fetch(`${API_BASE_URL}/smalltalk/relevant`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await getAuthToken()}`
      },
      body: JSON.stringify({ participants })
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch small talk');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching small talk:', error);
    return [];
  }
}

// Get authentication token
async function getAuthToken() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['authToken'], (result) => {
      resolve(result.authToken || '');
    });
  });
}

