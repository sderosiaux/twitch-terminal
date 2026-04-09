chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("terminal.html") });
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "new-terminal") {
    chrome.tabs.create({ url: chrome.runtime.getURL("terminal.html") });
  }
});
