const EMRBaseURL = "https://app1.intellechart.net/"


// On clicking the toolbar icon, it checks whether it is the correct page and 
// then Sidepanel will be opened and extract data function will be injected.
chrome.action.onClicked.addListener((tab) =>{
    if (validateURL(tab.url)){
        chrome.sidePanel.open({ tabId : tab.id }, () => {
            console.log("Side Panel Opened");
        });
    }
});


// Validate the URL
function validateURL(url) {
    return url.startsWith(EMRBaseURL);
}


// Shows the sidebar for the valid URL and hides for the other URLs.
function handleTabChange(tabId) {
    chrome.tabs.get(tabId, async (tab) => {
        await chrome.sidePanel.setOptions({
            tabId,
            path: '../auth/auth.html',
            enabled: validateURL(tab.url)
        });
    });
}


// When user switches tabs
chrome.tabs.onActivated.addListener((activeInfo) => {
    handleTabChange(activeInfo.tabId);
});


// When the URL of a tab changes
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url) {
        handleTabChange(tabId);
    }
});


// Listens to the scrapeData message request raised when the patient data record button is clicked.
chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "scrapeData") {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs.length) return;
            const tab = tabs[0];
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: extractData
            });
        });
    }
});


// Extracts the necessary fields from the injected page (on the left side) and 
// returns the scraped values to the sidebar (right side extension).
function extractData() {
    var patientName = 'Not found';
    var patientId = 'Not found';
    var patientPhone = 'Not found';
    var dob = 'Not found';

    const table = document.getElementById("searchResultTable");
    if (table && table.tBodies.length > 0) {
        const firstRow = table.tBodies[0].rows[0]; // Get the first row of the first tbody
        if (firstRow) {
            patientName = firstRow.cells?.[0].textContent;
            patientId = firstRow.cells?.[1].textContent;
            patientPhone = firstRow.cells?.[2].textContent;
            dob = firstRow.cells?.[3].textContent;
        }
    }

    // The sidepanel.js takes some latency to load, so we return the data after 500ms.
    setTimeout(() => {
        chrome.runtime.sendMessage({
            type: 'return_data',
            data: {
                patientId: patientId,
                patientName: patientName,
                patientPhone: patientPhone,
                dob: dob
            }
        });
    }, 500);
}
