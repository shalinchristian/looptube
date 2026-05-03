const api = globalThis.browser || chrome;
const usingBrowserApi = typeof globalThis.browser !== 'undefined';
const ENABLED_KEY = 'looptubeEnabled';

const checkbox = document.getElementById('enabled');

function storageGet(defaults) {
    if (usingBrowserApi) {
        return api.storage.local.get(defaults);
    }

    return new Promise((resolve) => {
        api.storage.local.get(defaults, resolve);
    });
}

function storageSet(values) {
    if (usingBrowserApi) {
        return api.storage.local.set(values);
    }

    return new Promise((resolve) => {
        api.storage.local.set(values, resolve);
    });
}

function queryActiveTab() {
    const query = { active: true, currentWindow: true };

    if (usingBrowserApi) {
        return api.tabs.query(query);
    }

    return new Promise((resolve) => {
        api.tabs.query(query, resolve);
    });
}

function sendMessage(tabId, message) {
    if (usingBrowserApi) {
        return api.tabs.sendMessage(tabId, message);
    }

    return new Promise((resolve, reject) => {
        api.tabs.sendMessage(tabId, message, () => {
            const error = api.runtime.lastError;

            if (error) {
                reject(error);
            } else {
                resolve();
            }
        });
    });
}

async function notifyCurrentTab(enabled) {
    const tabs = await queryActiveTab();
    const tab = tabs[0];

    if (!tab || !tab.id) return;

    try {
        await sendMessage(tab.id, {
            action: 'toggleExtension',
            enabled
        });
    } catch {
    }
}

async function loadState() {
    const data = await storageGet({ [ENABLED_KEY]: true });
    checkbox.checked = Boolean(data[ENABLED_KEY]);
}

checkbox.addEventListener('change', async () => {
    const enabled = checkbox.checked;

    await storageSet({ [ENABLED_KEY]: enabled });
    await notifyCurrentTab(enabled);
});

loadState();
