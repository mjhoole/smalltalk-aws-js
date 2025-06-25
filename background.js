// background.js - Service Worker for Chrome Extension

const API_BASE_URL = 'https://7m0j2avi6j.execute-api.ap-southeast-2.amazonaws.com'; // Replace with actual API Gateway URL
const WS_URL = 'wss://vbx2hmj6r3.execute-api.ap-southeast-2.amazonaws.com/$default/'; // Replace with actual WebSocket URL

let websocket = null;
let isRecording = false;
let isConnecting = false;

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
    case 'recordingData':
      handleRecordingData(request.data.audioData, request.data.meetingId);
      sendResponse({ success: true });
      break;
    case 'startTabCapture':
      handleStartTabCapture(request.data, sendResponse);
      break;
    default:
      sendResponse({ error: 'Unknown action' });
  }
  return true; // Keep message channel open for async response
});

// Handle meeting start
async function handleStartMeeting(data, sendResponse) {
  try {
    // Connect to WebSocket if not already connected
    if (!websocket || websocket.readyState !== WebSocket.OPEN) {
      if (!isConnecting) {
        isConnecting = true;
        await connectWebSocket();
        isConnecting = false;
      } else {
        // Wait for existing connection attempt
        while (isConnecting) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    }
    
    // Get user consent
    const consentGranted = await requestUserConsent(data.participants);
    if (!consentGranted) {
      sendResponse({ error: 'User consent not granted' });
      return;
    }

    // Request content script to start recording
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'startRecording',
          meetingId: data.meetingId
        });
      }
    });
    
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

// Connect to WebSocket for real-time communication with retry logic
function connectWebSocket(retryCount = 0, maxRetries = 3) {
  return new Promise((resolve, reject) => {
    if (retryCount > maxRetries) {
      reject(new Error('Max WebSocket connection retries exceeded'));
      return;
    }

    websocket = new WebSocket(WS_URL);
    
    websocket.onopen = () => {
      console.log('WebSocket connected');
      isConnecting = false;
      resolve();
    };
    
    websocket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      handleWebSocketMessage(data);
    };
    
    websocket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
    
    websocket.onclose = (event) => {
      console.log('WebSocket disconnected:', event.code, event.reason);
      
      // Handle rate limiting (429) or other connection issues
      if (event.code === 1006 || event.code === 1011) {
        const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
        console.log(`Retrying WebSocket connection in ${delay}ms (attempt ${retryCount + 1}/${maxRetries + 1})`);
        
        setTimeout(() => {
          connectWebSocket(retryCount + 1, maxRetries)
            .then(resolve)
            .catch(reject);
        }, delay);
      } else {
        isConnecting = false;
        reject(new Error(`WebSocket connection failed: ${event.code} ${event.reason}`));
      }
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

// Handle tab capture start
async function handleStartTabCapture(data, sendResponse) {
  try {
    // Use chrome.tabCapture to get audio stream
    chrome.tabCapture.capture({ audio: true }, (stream) => {
      if (chrome.runtime.lastError) {
        console.error('Tab capture error:', chrome.runtime.lastError);
        sendResponse({ error: chrome.runtime.lastError.message });
        return;
      }
      
      if (stream) {
        startRecordingWithStream(stream, data.meetingId);
        sendResponse({ success: true });
      } else {
        sendResponse({ error: 'Failed to capture tab audio' });
      }
    });
  } catch (error) {
    console.error('Error starting tab capture:', error);
    sendResponse({ error: error.message });
  }
}

// Start recording with captured stream
function startRecordingWithStream(stream, meetingId) {
  try {
    const mediaRecorder = new MediaRecorder(stream);
    
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        // Convert audio data and send to WebSocket
        const reader = new FileReader();
        reader.onload = () => {
          handleRecordingData(reader.result, meetingId);
        };
        reader.readAsArrayBuffer(event.data);
      }
    };
    
    mediaRecorder.onerror = (error) => {
      console.error('MediaRecorder error:', error);
    };
    
    mediaRecorder.start(1000); // Capture audio in 1-second chunks
    isRecording = true;
    
    console.log('Tab audio recording started');
    
  } catch (error) {
    console.error('Error starting recording with stream:', error);
  }
}

// Handle recording data from content script
function handleRecordingData(audioData, meetingId) {
  // Send audio chunk to backend via WebSocket
  if (websocket && websocket.readyState === WebSocket.OPEN) {
    websocket.send(JSON.stringify({
      action: 'ingestAudio',
      meetingId: meetingId,
      audioData: audioData
    }));
  }
}

// Stop audio recording
async function stopRecording() {
  isRecording = false;
  // Request content script to stop recording
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'stopRecording'
      });
    }
  });
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

