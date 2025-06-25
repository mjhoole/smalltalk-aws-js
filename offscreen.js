let mediaRecorder = null;
let audioStream = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startRecording') {
    startRecording(message.meetingId);
    sendResponse({ success: true });
  } else if (message.action === 'stopRecording') {
    stopRecording();
    sendResponse({ success: true });
  }
});

async function startRecording(meetingId) {
  try {
    audioStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 44100
      }
    });

    mediaRecorder = new MediaRecorder(audioStream);
    
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        const reader = new FileReader();
        reader.onload = () => {
          chrome.runtime.sendMessage({
            action: 'audioData',
            data: {
              audioData: reader.result,
              meetingId: meetingId
            }
          });
        };
        reader.readAsArrayBuffer(event.data);
      }
    };

    mediaRecorder.start(1000);
    console.log('Recording started');
  } catch (error) {
    console.error('Recording error:', error.name, error.message);
    chrome.runtime.sendMessage({
      action: 'recordingError',
      error: error.message
    });
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  if (audioStream) {
    audioStream.getTracks().forEach(track => track.stop());
    audioStream = null;
  }
  mediaRecorder = null;
}