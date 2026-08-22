// Background service worker: owns the WebSocket connection to the local server 
const WS_HOST = 'localhost';
const WS_PORT = 10043;
const SUBMIT_BASE_URL = `http://${WS_HOST}:${WS_PORT}`;

let socket = null;
let queue = [];
let connecting = null;

function connect() {
    if (socket && socket.readyState === WebSocket.OPEN) {
        return Promise.resolve();
    }
    if (connecting) {
        return connecting;
    }

    connecting = new Promise((resolve, reject) => {
        socket = new WebSocket(`ws://${WS_HOST}:${WS_PORT}`);

        socket.onopen = () => {
            console.log('[CF Companion] Connected');
            while (queue.length > 0) {
                socket.send(JSON.stringify(queue.shift()));
            }
            connecting = null;
            resolve();
        };

        socket.onerror = (error) => {
            console.error('[CF Companion] WebSocket error:', error);
            connecting = null;
            reject(error);
        };

        socket.onclose = () => {
            console.log('[CF Companion] WebSocket disconnected');
            socket = null;
        };
    });

    return connecting;
}

async function sendData(data) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        queue.push(data);
        try {
            await connect();
        } catch (error) {
            console.error('[CF Companion] Connection failed:', error);
        }
        return;
    }
    socket.send(JSON.stringify(data));
}

async function submitPoll() {
    const res = await fetch(`${SUBMIT_BASE_URL}/submit-poll`, { method: 'GET' });
    if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
    }
    return res.json();
}

async function submitResult(jobId, ok, message) {
    try {
        await fetch(`${SUBMIT_BASE_URL}/submit-result`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobId, ok, message }),
        });
    } catch (err) {
        // Best-effort, same as the original.
    }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || !msg.type) {
        return false;
    }

    if (msg.type === 'ws_send') {
        sendData(msg.data).then(() => sendResponse({ ok: true }));
        return true;
    }

    if (msg.type === 'submit_poll') {
        submitPoll()
            .then((body) => sendResponse({ ok: true, body }))
            .catch((err) => sendResponse({ ok: false, error: String(err) }));
        return true;
    }

    if (msg.type === 'submit_result') {
        submitResult(msg.jobId, msg.resultOk, msg.message).then(() =>
            sendResponse({ ok: true })
        );
        return true;
    }

    return false;
});

// Toolbar icon click == the page's floating "CFC" button.
chrome.action.onClicked.addListener((tab) => {
    if (tab && tab.id !== undefined) {
        chrome.tabs.sendMessage(tab.id, { type: 'run_process_page' });
    }
});
