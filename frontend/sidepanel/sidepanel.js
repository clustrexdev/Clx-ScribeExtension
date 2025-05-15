console.log("Sidepanel script is loaded")   // For verifying the sidepanel.js is loaded successfully.

var patientId;
var email = "";
// const appBaseURL = "http://127.0.0.1:5000";
const appBaseURL = "https://m8sdzc9ge3.execute-api.us-east-1.amazonaws.com/dev";


// Headers
const getHeaders = {
    "authorizationToken": "allow"
}
const postHeaders = {
    "Content-Type": "application/json",
    "authorizationToken": "allow"
}


// Logout Button
document.getElementById("logout").addEventListener("click", () => {
    logout();
});


// Fetch the email from extension's local storage.
chrome.storage.local.get("profile", function(result) {
    email = result.profile.email;
    document.getElementById("email").textContent = email;
    console.log("User email:", result.profile.email);
});


// Logout function
function logout(){
    chrome.identity.getAuthToken({ interactive: false }, function(token) {
        if (chrome.runtime.lastError || !token) return;
    
        chrome.identity.removeCachedAuthToken({ token: token }, function() {
            fetch('https://accounts.google.com/o/oauth2/revoke?token=' + token)
            .then(() => {
                window.location.href = chrome.runtime.getURL("../auth/auth.html");
            });
        });
    });
}


// On clicking the recordPatientDataButton it sends a request to background.js file to scrape the data.
document.getElementById("recordPatientDataButton").addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "scrapeData" });
});


// Checks whether the scraped data is a valid Patient. (must be a proper integer value)
function isValidPatientId(patientId){
    return patientId !== "Not found" && !isNaN(patientId) && patientId.trim() !== "";
}


// On successful scraping of data the call sends the scraped data to show in the extension.
chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "return_data") {
        patientId = message.data.patientId;
        if (isValidPatientId(patientId)){
            document.getElementById("startRecordButton").classList.remove("disabled");
            document.getElementById("stopRecordBtn").classList.remove("disabled");
            document.getElementById("recordPatientDataButton").style.display = "none";
            document.getElementById("NoPatientDetails").style.display = "none";
            document.getElementById("patientId").innerText = patientId;
            document.getElementById("patientName").innerText = message.data.patientName;
            document.getElementById("patientPhone").innerText = message.data.patientPhone;
            document.getElementById("dob").innerText = message.data.dob;
        }
        else{
            document.getElementById("startRecordButton").classList.add("disabled");
            document.getElementById("stopRecordBtn").classList.add("disabled");
            document.getElementById("recordPatientDataButton").style.display="block";
            document.getElementById("NoPatientDetails").style.display = "block";
        }
    }
});


// Recording related functions starts here...
let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let isPaused = false;
let interval;
let seconds = 0;

const startRecordButton = document.getElementById("startRecordButton");
const stopRecordBtn = document.getElementById("stopRecordBtn");
const statusText = document.getElementById("status");
const resultBox = document.getElementById("result");
const soundWave = document.querySelector('.sound-wave');
const timerElement = document.getElementById("timer");
const container = document.getElementById('llmResponse');

document.getElementById("startRecordButton").classList.add("disabled");
document.getElementById("stopRecordBtn").classList.add("disabled");


// This updates the timer during audio recording
function updateTimer() {
    let mins = String(Math.floor(seconds / 60)).padStart(2, '0');
    let secs = String(seconds % 60).padStart(2, '0');
    timerElement.textContent = `${mins}:${secs}`;
}


// Functionalities should be happening when the recording starts.
function startRecordingUI(){
    isPaused = false;
    isRecording = true;
    resultBox.textContent = "...";
    container.textContent = "...";
    statusText.textContent = "Recording...";
    document.getElementById("pause").style.display = "block";
    document.getElementById("start").style.display = "none";
    soundWave.classList.add('recording');
    interval = setInterval(() => {
        seconds++;
        updateTimer();
      }, 1000);
}


// Functionalities should be happening when the recording paused.
function pauseRecordingUI(){
    isPaused = true;
    statusText.textContent = "Paused...";
    document.getElementById("pause").style.display = "none";
    document.getElementById("start").style.display = "block";
    soundWave.classList.remove('recording');
    clearInterval(interval);
}


// Functionalities should be happening when the recording stops.
function stopRecordingUI(){
    isPaused = false;
    isRecording = false;
    statusText.textContent = "Processing...";
    document.getElementById("pause").style.display = "none";
    document.getElementById("start").style.display = "block";
    soundWave.classList.remove('recording');
    clearInterval(interval);
    seconds = 0;
    timerElement.textContent = "00:00";
}


// Start and Pause Recording
startRecordButton.onclick = async () => {
    if (!isRecording) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) audioChunks.push(e.data);
        };
        mediaRecorder.start();  // This start should be placed after mediaRecorder.ondataavailable to support pause and record flow.
        startRecordingUI();
    } else if (!isPaused) {
        mediaRecorder.pause();
        pauseRecordingUI();
    } else {
        mediaRecorder.resume();
        startRecordingUI();
    }
};


// Stop Recording
stopRecordBtn.onclick = async () => {
    mediaRecorder.stop();
    stopRecordingUI();

    mediaRecorder.onstop = async () => {
        const timestamp = Date.now();
        const fileName = `${timestamp}.mp3`;
        const blob = new Blob(audioChunks, { type: "audio/mp3" });
        const audioUrl = URL.createObjectURL(blob);

        const audioElement = document.getElementById("audioplayer");
        audioElement.src = audioUrl;
        audioElement.load(); // Refresh the source
        
        const uploadURL = await getPreSignedURL(fileName);

        if (uploadURL != null) {
            const uploadStatus = await uploadBlob(blob, uploadURL);
            statusText.textContent = uploadStatus.message;
            
            if (uploadStatus.status == "Success") {
                resultBox.textContent = "Generating...";
                const transcribedData = await transcribe(fileName);
                const transcript = transcribedData?.response?.text || null;
                
                if (transcribedData.status == "Success" && transcript != null) {
                    // LLM Response is temporarily commented.
                    resultBox.textContent = transcript;
                    container.textContent = "Generating...";
                    const llmResponse = await llm_response(transcript);
                    console.log(llmResponse);
                    let counter = 1;
                    container.textContent = "";
                    for (const [question, answer] of Object.entries(llmResponse)) {
                        const item = document.createElement('div');
                        item.className = 'qna-item';
                  
                        const q = document.createElement('div');
                        q.className = 'bold';
                        q.textContent = `${counter}. ${question}`;
                  
                        const a = document.createElement('div');
                        // a.className = 'answer';
                        a.textContent = answer;
                  
                        item.appendChild(q);
                        item.appendChild(a);
                        container.appendChild(item);
                        counter += 1;
                    }
                } else {
                    resultBox.textContent = transcribedData.message;
                    container.textContent = "No transcription!";
                }
            }
        } else {
            statusText.textContent = "Failed to upload!";
        }
    };
}


// Gets the Presigned URL to upload the audio file to S3.
async function getPreSignedURL(objectName){
    const params = new URLSearchParams({object_name: `${objectName}`, patient_id: patientId, email: email});
    const response = await fetch(`${appBaseURL}/get-s3-presigned-url?${params}`, {
        method: "GET", headers: getHeaders
    })
    .then(res => res.json())
    .then(data => data.presigned_url)
    .catch(error => {
        console.error('Error:', error);
        return null;
    });
    return response;
}


// Uploads the audio blob in the given presigned URL.
async function uploadBlob(blob, presignedUrl) {
    try {
        console.log("File upload has started.")
        const response = await fetch(presignedUrl, {
            method: "PUT",
            headers: {
                'Content-Type':  blob.type
            },
            body: blob
        });
    
        if (response.ok) {
            return { message: "File uploaded successfully!", status: "Success"};
        } else {
            console.error("Upload failed:", response.status, await response.text());
            return { message: "Failed to upload!", status: "Failed"};
        }
    } catch (error) {
        console.error("Error uploading Blob:", error);
        return { message: "Errored out while uploading blob!", status: "Failed"};
    }
}


// Transcribes the audio file uploaded in the S3 bucket and 
// puts the transcribed file in the bucket as well as sends back the transcribed text back.
async function transcribe(objectName){
    try {
        console.log("Started Transcription Job.")
        const response = await fetch(`${appBaseURL}/transcribe`, {
            method: "POST", headers: postHeaders,
            body: JSON.stringify({
                "object_name": objectName
            })
        })
        .then(res => res.json())
        .then(data => data)
        .catch(error => {
            console.error('Error:', error);
            return null;
        });

        if (response != null) {
            return { response: response, status: "Success"}
        }
        else {
            return { message: "Failed to upload!", status: "Failed"};
        }
    } catch (error) {
        console.error("Error while transcribing:", error);
        return { message: "Errored out while Transcribing!", status: "Failed"};
    }
}


// From the given text the llm provides the response for the predefined questions setup.
async function llm_response(text){
    console.log("Started generating LLm Response.");
    const response = await fetch(`${appBaseURL}/llm-response`, {
        method: "POST", headers: postHeaders,
        body: JSON.stringify({
            "transcribed_text": text
        })
    })
    .then(res => res.json())
    .then(data => data)
    .catch(error => {
        console.error('Error:', error);
        return null;
    });
    return response;
}

