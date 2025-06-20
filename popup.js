// popup.js - Popup script for SmallTalkPro extension

document.addEventListener('DOMContentLoaded', () => {
  updateStatus();
  
  document.getElementById('settingsBtn').addEventListener('click', openSettings);
  document.getElementById('helpBtn').addEventListener('click', openHelp);
});

function updateStatus() {
  // Check if currently in a meeting
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    const statusElement = document.getElementById('status');
    
    if (tab && (tab.url.includes('teams.microsoft.com') || tab.url.includes('meet.google.com'))) {
      statusElement.textContent = 'Ready for meeting';
      statusElement.className = 'status active';
    } else {
      statusElement.textContent = 'Not in a meeting';
      statusElement.className = 'status inactive';
    }
  });
}

function openSettings() {
  chrome.tabs.create({ url: chrome.runtime.getURL('settings.html') });
}

function openHelp() {
  chrome.tabs.create({ url: 'https://smalltalkpro.com/help' });
}