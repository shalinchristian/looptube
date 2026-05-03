const api = globalThis.browser || chrome;
const usingBrowserApi = typeof globalThis.browser !== 'undefined';

const BUTTON_ID = 'looptube-btn';
const ENABLED_KEY = 'looptubeEnabled';
const VIDEO_KEY_PREFIX = 'looptube:video:';

const state = {
    enabled: true,
    player: null,
    video: null,
    controls: null,
    videoId: '',
    wasAdShowing: false,
    ignoringLoopChange: false,
    scheduled: false,
    started: false,
    observedTarget: null,
    domObserver: null,
    videoObserver: null
};

function storageGet(defaults) {
    if (usingBrowserApi) {
        return api.storage.local.get(defaults);
    }

    return new Promise((resolve) => {
        api.storage.local.get(defaults, resolve);
    });
}

function getPlayer() {
    if (state.player && state.player.isConnected) return state.player;

    const players = Array.from(document.querySelectorAll('.html5-video-player'));
    state.player = players.find((player) => player.offsetParent !== null) || players[0] || null;
    return state.player;
}

function getVideo() {
    const player = getPlayer();
    return player
        ? player.querySelector('video.html5-main-video') || player.querySelector('video')
        : document.querySelector('video.html5-main-video') || document.querySelector('video');
}

function getControls() {
    if (state.controls && state.controls.isConnected) return state.controls;

    const player = getPlayer();
    state.controls = player
        ? player.querySelector('.ytp-right-controls')
        : document.querySelector('.ytp-right-controls');

    return state.controls;
}

function getButton() {
    return document.getElementById(BUTTON_ID);
}

function isAdShowing() {
    const player = getPlayer();
    return Boolean(player && player.classList.contains('ad-showing'));
}

function getVideoId() {
    const url = new URL(location.href);

    if (url.hostname === 'youtu.be') {
        return url.pathname.slice(1) || 'unknown';
    }

    if (url.pathname.startsWith('/shorts/')) {
        return url.pathname.split('/')[2] || 'unknown';
    }

    return url.searchParams.get('v') || url.pathname;
}

function getSavedLoop(videoId) {
    return localStorage.getItem(VIDEO_KEY_PREFIX + videoId) === 'true';
}

function saveLoop() {
    if (!state.enabled || state.ignoringLoopChange || !state.video || !state.videoId || isAdShowing()) return;
    localStorage.setItem(VIDEO_KEY_PREFIX + state.videoId, String(state.video.loop));
}

function updateButton() {
    const button = getButton();
    const active = Boolean(state.enabled && state.video && state.video.loop && !isAdShowing());

    if (!button) return;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
}

function setLoop(value, shouldSave) {
    if (!state.video) return;

    state.ignoringLoopChange = !shouldSave;
    state.video.loop = value;

    if (shouldSave) saveLoop();
    updateButton();

    if (!shouldSave) {
        requestAnimationFrame(() => {
            state.ignoringLoopChange = false;
        });
    }
}

function toggleLoop() {
    if (!state.enabled || !state.video || isAdShowing()) return;
    setLoop(!state.video.loop, true);
}

function createIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');

    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    path.setAttribute('fill', 'currentColor');
    path.setAttribute('d', 'M7 7h11v3l4-4-4-4v3H5v6h2zm10 10H6v-3l-4 4 4 4v-3h13v-6h-2z');

    svg.appendChild(path);
    return svg;
}

function createButton() {
    const button = document.createElement('button');

    button.id = BUTTON_ID;
    button.type = 'button';
    button.className = 'ytp-button looptube-button';
    button.title = 'Loop (L)';
    button.setAttribute('aria-label', 'Loop (L)');
    button.setAttribute('aria-pressed', 'false');
    button.appendChild(createIcon());
    button.addEventListener('click', toggleLoop);

    return button;
}

function placeButton(button, controls) {
    const ccButton = Array.from(controls.children).find((child) => {
        return child.classList && child.classList.contains('ytp-subtitles-button');
    });

    try {
        if (ccButton && ccButton.parentNode === controls) {
            ccButton.before(button);
        } else {
            controls.appendChild(button);
        }
    } catch {
        try {
            if (controls.isConnected) {
                controls.appendChild(button);
            }
        } catch {
            button.remove();
        }
    }
}

function ensureButton() {
    const controls = getControls();
    const oldButton = getButton();

    if (!controls) return;
    if (oldButton && oldButton.parentNode === controls) {
        updateButton();
        return;
    }

    if (oldButton) oldButton.remove();

    try {
        placeButton(createButton(), controls);
    } catch {
        getButton()?.remove();
    }

    updateButton();
}

function watchVideo(video) {
    const videoId = getVideoId();

    if (video === state.video && videoId === state.videoId) return;
    if (state.videoObserver) state.videoObserver.disconnect();

    state.video = video;
    state.videoId = videoId;

    state.videoObserver = new MutationObserver(() => {
        saveLoop();
        updateButton();
    });
    state.videoObserver.observe(video, {
        attributes: true,
        attributeFilter: ['loop']
    });

    if (!isAdShowing()) {
        setLoop(getSavedLoop(videoId), false);
    }

    updateButton();
}

function refreshVideo() {
    const video = getVideo();

    if (video) {
        watchVideo(video);
    } else {
        state.video = null;
        state.videoId = '';
        updateButton();
    }
}

function handleAds() {
    const adShowing = isAdShowing();

    if (adShowing && state.video && state.video.loop) {
        setLoop(false, false);
    }

    if (state.wasAdShowing && !adShowing && state.video) {
        setLoop(getSavedLoop(state.videoId), false);
    }

    state.wasAdShowing = adShowing;
}

function run() {
    state.scheduled = false;
    if (!state.enabled) return;

    observeDom();
    refreshVideo();
    ensureButton();
    handleAds();
}

function scheduleRun() {
    if (!state.enabled || state.scheduled) return;

    state.scheduled = true;
    requestAnimationFrame(run);
}

function observeDom() {
    const target = getPlayer() || document.body;
    if (!target || target === state.observedTarget) return;

    if (state.domObserver) state.domObserver.disconnect();

    state.observedTarget = target;
    state.domObserver = new MutationObserver(scheduleRun);

    const options = {
        childList: true,
        subtree: true
    };

    if (target === state.player) {
        options.attributes = true;
        options.attributeFilter = ['class'];
    }

    state.domObserver.observe(target, options);
}

function isTyping(event) {
    const tagName = event.target && event.target.tagName
        ? event.target.tagName.toLowerCase()
        : '';

    return (
        event.target &&
        (event.target.isContentEditable ||
            tagName === 'input' ||
            tagName === 'textarea' ||
            tagName === 'select')
    );
}

function handleKeydown(event) {
    if (isTyping(event)) return;
    if (event.ctrlKey || event.altKey || event.metaKey) return;

    if (event.key.toLowerCase() === 'l') {
        event.preventDefault();
        event.stopPropagation();
        toggleLoop();
    }
}

function resetCache() {
    state.player = null;
    state.video = null;
    state.controls = null;
    state.videoId = '';
    state.wasAdShowing = false;
}

function start() {
    if (state.started) return;

    state.started = true;
    state.enabled = true;
    document.addEventListener('keydown', handleKeydown, true);
    window.addEventListener('yt-navigate-finish', handleNavigation);
    window.addEventListener('yt-page-data-updated', handleNavigation);

    observeDom();
    run();
}

function stop() {
    state.enabled = false;
    state.started = false;
    state.scheduled = false;

    document.removeEventListener('keydown', handleKeydown, true);
    window.removeEventListener('yt-navigate-finish', handleNavigation);
    window.removeEventListener('yt-page-data-updated', handleNavigation);

    if (state.domObserver) state.domObserver.disconnect();
    if (state.videoObserver) state.videoObserver.disconnect();

    state.domObserver = null;
    state.videoObserver = null;
    state.observedTarget = null;
    getButton()?.remove();
    resetCache();
}

function handleNavigation() {
    if (state.videoObserver) {
        state.videoObserver.disconnect();
        state.videoObserver = null;
    }

    resetCache();
    observeDom();
    scheduleRun();
}

function setEnabled(enabled) {
    if (enabled) {
        start();
    } else {
        stop();
    }
}

function handleMessage(message, sender, sendResponse) {
    if (!message || message.action !== 'toggleExtension') return false;

    setEnabled(Boolean(message.enabled));
    sendResponse({ ok: true });
    return false;
}

function handleStorageChange(changes, areaName) {
    if (areaName !== 'local' || !changes[ENABLED_KEY]) return;
    setEnabled(Boolean(changes[ENABLED_KEY].newValue));
}

api.runtime.onMessage.addListener(handleMessage);
api.storage.onChanged.addListener(handleStorageChange);

storageGet({ [ENABLED_KEY]: true }).then((data) => {
    state.enabled = Boolean(data[ENABLED_KEY]);
    if (state.enabled) {
        if (document.body) {
            start();
        } else {
            window.addEventListener('DOMContentLoaded', start, { once: true });
        }
    }
});
