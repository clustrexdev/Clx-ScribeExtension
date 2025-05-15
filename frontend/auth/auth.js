// Google OAuth Login
document.getElementById("login").addEventListener("click", () => {
    chrome.identity.getAuthToken({ interactive: true }, function (token) {
    if (chrome.runtime.lastError) {
        console.error("Auth error:", chrome.runtime.lastError);
        document.getElementById("output").textContent = "Login failed.";
        return;
    }

    fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: {
        Authorization: "Bearer " + token
        }
    })
        .then(response => response.json())
        .then(profile => {
            chrome.storage.local.set({ profile: profile }, () => {
                document.getElementById("output").textContent = "";
                //   console.log(JSON.stringify(profile, null));
                window.location.href = chrome.runtime.getURL("../sidepanel/sidepanel.html");
                chrome.runtime.sendMessage({ action: "scrapeData" });
              });
        })
        .catch(err => {
        console.error("API error:", err);
        });
    });
});

