chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.status !== 'complete') return;
  const enabled = Boolean(tab.url?.startsWith('https://calendar.google.com/'));
  chrome.sidePanel.setOptions({ tabId, path: 'panel.html', enabled }).catch(console.error);
});
