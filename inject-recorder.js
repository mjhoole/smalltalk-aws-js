(function() {
  let mediaRecorder, audioStream;
  
  function startRecording(meetingId) {
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        audioStream = stream;
        mediaRecorder = new MediaRecorder(stream);
        
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            const reader = new FileReader();
            reader.onload = () => {
              window.postMessage({
                type: 'AUDIO_DATA',
                audioData: reader.result,
                meetingId: meetingId
              }, '*');
            };
            reader.readAsArrayBuffer(event.data);
          }
        };
        
        mediaRecorder.start(1000);
        console.log('Recording started');
      })
      .catch(error => {
        console.error('Recording error:', error);
        window.postMessage({ type: 'RECORDING_ERROR', error: error.message }, '*');
      });
  }
  
  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    if (audioStream) {
      audioStream.getTracks().forEach(track => track.stop());
    }
  }
  
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    
    if (event.data.type === 'START_RECORDING') {
      startRecording(event.data.meetingId);
    } else if (event.data.type === 'STOP_RECORDING') {
      stopRecording();
    }
  });
})();