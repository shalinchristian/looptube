const api = globalThis.browser || chrome;
const usingBrowserApi = typeof globalThis.browser !== 'undefined';

const BUTTON_ID = 'looptube-btn';
const ENABLED_KEY = 'looptubeEnabled';
const VIDEO_KEY_PREFIX = 'looptube:video:';
const isMobile = location.hostname.includes('m.youtube.com');

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
    videoObserver: null,
    retryTimeout: null,
    mobileInterval: null
};

function storageGet(defaults) {
    if (usingBrowserApi) {
        return api.storage.local.get(defaults);
    }
    return new Promise((res) => {
        api.storage.local.get(defaults, res);
    });
}

function isVisMobileVid(video) {
    if (!video || !video.isConnected) return false;
    const rect = video.getBoundingClientRect();
    const style = getComputedStyle(video);

    return (
        rect.width > 40 &&
        rect.height > 40 &&
        rect.bottom > 0 &&
        rect.right > 0 &&
        rect.top < window.innerHeight &&
        rect.left < window.innerWidth &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.opacity !== '0'
    );
}

function getMobileVid() {
    const vids = Array.from(document.querySelectorAll('video'));
    return vids.find(isVisMobileVid) || vids[0] || null;
}

function getPlayer() {
    if (state.player && state.player.isConnected) return state.player;

    if (isMobile) {
        const vid = state.video && isVisMobileVid(state.video) ? state.video : getMobileVid();
        state.player = document.querySelector('.html5-video-player') || (vid ? vid.parentElement : null);
        return state.player;
    }

    const players = Array.from(document.querySelectorAll('.html5-video-player'));
    state.player = players.find((p) => p.offsetParent !== null) || players[0] || null;
    return state.player;
}

function getVideo() {
    if (isMobile) return getMobileVid();
    
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
    if (url.hostname === 'youtu.be') return url.pathname.slice(1) || 'unknown';
    if (url.pathname.startsWith('/shorts/')) return url.pathname.split('/')[2] || 'unknown';
    return url.searchParams.get('v') || url.pathname;
}

function getSavedLoop(id) {
    return localStorage.getItem(VIDEO_KEY_PREFIX + id) === 'true';
}

function saveLoop() {
    if (!state.enabled || state.ignoringLoopChange || !state.video || !state.videoId || isAdShowing()) return;
    localStorage.setItem(VIDEO_KEY_PREFIX + state.videoId, String(state.video.loop));
}

function updateButton() {
    const btn = getButton();
    const active = Boolean(state.enabled && state.video && state.video.loop && !isAdShowing());

    if (!btn) return;
    
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));

    if (isMobile) {
        btn.style.color = active ? '#3ea6ff' : '#ffffff';
    }
}

function setLoop(val, shouldSave) {
    if (!state.video) return;

    state.ignoringLoopChange = !shouldSave;
    state.video.loop = val;

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
    const btn = document.createElement('button');
    btn.id = BUTTON_ID;
    btn.type = 'button';
    btn.className = 'ytp-button looptube-button';
    btn.title = 'Loop (L)';
    btn.setAttribute('aria-label', 'Loop (L)');
    btn.setAttribute('aria-pressed', 'false');
    btn.appendChild(createIcon());
    btn.addEventListener('click', toggleLoop);
    return btn;
}

function createMobileButton() {
    const btn = document.createElement('button');
    const icon = createIcon();

    btn.id = BUTTON_ID;
    btn.type = 'button';
    btn.className = 'icon-button looptube-mobile-button'; 
    btn.title = 'Loop';
    btn.setAttribute('aria-label', 'Loop');
    btn.setAttribute('aria-pressed', 'false');
    
    // Restored center-right positioning
    btn.style.setProperty('position', 'absolute', 'important');
    btn.style.setProperty('top', '50%', 'important');
    btn.style.setProperty('right', '15px', 'important');
    btn.style.setProperty('transform', 'translateY(-50%)', 'important');
    btn.style.setProperty('margin', '0', 'important');
    btn.style.setProperty('z-index', '2147483647', 'important'); 
    
    btn.style.background = 'rgba(0, 0, 0, 0.4)';
    btn.style.borderRadius = '50%';
    btn.style.color = '#ffffff';
    btn.style.border = 'none';
    btn.style.padding = '8px';
    btn.style.cursor = 'pointer';
    btn.style.transition = 'opacity 0.25s cubic-bezier(0,0,0.2,1), color 0.2s';

    icon.style.width = '24px';
    icon.style.height = '24px';
    icon.style.fill = 'currentColor';
    
    btn.appendChild(icon);

    btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation(); 
        toggleLoop();
    });

    return btn;
}

function placeButton(btn, controls) {
    const ccBtn = Array.from(controls.children).find((c) => c.classList && c.classList.contains('ytp-subtitles-button'));

    try {
        if (ccBtn && ccBtn.parentNode === controls) {
            ccBtn.before(btn);
        } else {
            controls.appendChild(btn);
        }
    } catch {
        try {
            if (controls.isConnected) controls.appendChild(btn);
        } catch {
            btn.remove();
        }
    }
}

function ensureButton() {
    if (isMobile) {
        ensureMobileButton();
    } else {
        const controls = getControls();
        const oldBtn = getButton();

        if (!controls) return;
        
        if (oldBtn && oldBtn.parentNode === controls) {
            updateButton();
            return;
        }

        if (oldBtn) oldBtn.remove();

        try {
            placeButton(createButton(), controls);
        } catch {
            getButton()?.remove();
        }

        updateButton();
    }
}

function ensureMobileButton() {
    let btn = document.getElementById(BUTTON_ID);

    if (!btn) btn = createMobileButton();

    const player = document.querySelector('.html5-video-player') || document.querySelector('ytm-mobile-video-player-ui')?.parentElement;

    if (!player) {
        clearTimeout(state.retryTimeout);
        state.retryTimeout = setTimeout(ensureMobileButton, 500);
        return;
    }

    if (btn.parentNode !== player) {
        player.appendChild(btn);
    }

    updateButton();

    if (!state.mobileInterval) {
        state.mobileInterval = setInterval(() => {
            const currentBtn = document.getElementById(BUTTON_ID);
            
            if (!currentBtn || !currentBtn.isConnected) {
                clearInterval(state.mobileInterval);
                state.mobileInterval = null;
                ensureMobileButton();
                return;
            }

            const isFull = !!document.fullscreenElement || !!document.webkitFullscreenElement;
            currentBtn.style.opacity = isFull ? '0' : '1';
            currentBtn.style.pointerEvents = isFull ? 'none' : 'auto';
        }, 300);
    }
}

function watchVideo(vid) {
    const id = getVideoId();

    if (vid === state.video && id === state.videoId) return;
    if (state.videoObserver) state.videoObserver.disconnect();

    state.video = vid;
    state.videoId = id;

    state.videoObserver = new MutationObserver(() => {
        saveLoop();
        updateButton();
    });
    
    state.videoObserver.observe(vid, {
        attributes: true,
        attributeFilter: ['loop']
    });

    if (!isAdShowing()) {
        setLoop(getSavedLoop(id), false);
    }

    updateButton();
}

function refreshVideo() {
    const vid = getVideo();

    if (vid) {
        watchVideo(vid);
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

    const options = { childList: true, subtree: true };

    if (target === state.player) {
        options.attributes = true;
        options.attributeFilter = ['class', 'style'];
    }

    state.domObserver.observe(target, options);
}

function isTyping(e) {
    const tag = e.target && e.target.tagName ? e.target.tagName.toLowerCase() : '';
    return e.target && (e.target.isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select');
}

function handleKeydown(e) {
    if (isTyping(e) || e.ctrlKey || e.altKey || e.metaKey) return;

    if (e.key.toLowerCase() === 'l') {
        e.preventDefault();
        e.stopPropagation();
        toggleLoop();
    }
}

function resetCache() {
    state.player = null;
    state.video = null;
    state.controls = null;
    state.videoId = '';
    state.wasAdShowing = false;
    clearTimeout(state.retryTimeout);
    
    if (state.mobileInterval) {
        clearInterval(state.mobileInterval);
        state.mobileInterval = null;
    }
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

function setEnabled(val) {
    if (val) start();
    else stop();
}

function handleMessage(msg, sender, sendRes) {
    if (!msg || msg.action !== 'toggleExtension') return false;

    setEnabled(Boolean(msg.enabled));
    sendRes({ ok: true });
    return false;
}

function handleStorageChange(changes, area) {
    if (area !== 'local' || !changes[ENABLED_KEY]) return;
    setEnabled(Boolean(changes[ENABLED_KEY].newValue));
}

api.runtime.onMessage.addListener(handleMessage);
api.storage.onChanged.addListener(handleStorageChange);

storageGet({ [ENABLED_KEY]: true }).then((data) => {
    state.enabled = Boolean(data[ENABLED_KEY]);
    if (state.enabled) {
        if (document.body) start();
        else window.addEventListener('DOMContentLoaded', start, { once: true });
    }
}); 