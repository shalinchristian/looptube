const api = globalThis.browser || chrome;
const usingBrowserApi = typeof globalThis.browser !== 'undefined';

const BUTTON_ID = 'looptube-btn';
const ENABLED_KEY = 'looptubeEnabled';
const VIDEO_KEY_PREFIX = 'looptube:video:';
const MOBILE_ACTIVATION_DEDUPE_MS = 350;
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
    adObserver: null,
    retryTimeout: null,
    mobileInterval: null,
    mobileInputHandlersInstalled: false,
    lastMobileActivation: 0
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
    try {
        return localStorage.getItem(VIDEO_KEY_PREFIX + id) === 'true';
    } catch {
        return false;
    }
}

function saveLoop() {
    if (!state.enabled || state.ignoringLoopChange || !state.video || !state.videoId || isAdShowing()) return;
    try {
        localStorage.setItem(VIDEO_KEY_PREFIX + state.videoId, String(state.video.loop));
    } catch { }
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
    // Force re-fetch of the video element just in case YouTube swapped it
    state.video = getVideo();
    if (!state.enabled || !state.video || isAdShowing()) return;

    setLoop(!state.video.loop, true);
}

function stopEvent(e, shouldPrevent) {
    if (shouldPrevent && e.cancelable) e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === 'function') {
        e.stopImmediatePropagation();
    }
}

function getEventPoint(e) {
    const touch = e.changedTouches && e.changedTouches[0];
    if (touch) return { x: touch.clientX, y: touch.clientY };

    if (typeof e.clientX === 'number' && typeof e.clientY === 'number') {
        return { x: e.clientX, y: e.clientY };
    }

    return null;
}

function mobileEventHitsButton(e) {
    if (!isMobile) return false;

    const btn = getButton();
    if (!btn || !btn.isConnected) return false;

    const style = getComputedStyle(btn);
    if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        style.pointerEvents === 'none' ||
        style.opacity === '0'
    ) {
        return false;
    }

    if (e.target === btn || btn.contains(e.target)) return true;

    const point = getEventPoint(e);
    if (!point) return false;

    const rect = btn.getBoundingClientRect();
    const hitSlop = 8;

    return (
        point.x >= rect.left - hitSlop &&
        point.x <= rect.right + hitSlop &&
        point.y >= rect.top - hitSlop &&
        point.y <= rect.bottom + hitSlop
    );
}

function absorbMobileButtonEvent(e) {
    if (!mobileEventHitsButton(e)) return;
    stopEvent(e, true);
}

function activateMobileButton(e) {
    if (!mobileEventHitsButton(e)) return;

    stopEvent(e, true);

    const now = performance.now();
    if (now - state.lastMobileActivation < MOBILE_ACTIVATION_DEDUPE_MS) return;

    state.lastMobileActivation = now;
    toggleLoop();
}

function installMobileInputHandlers() {
    if (!isMobile || state.mobileInputHandlersInstalled) return;

    window.addEventListener('pointerdown', absorbMobileButtonEvent, true);
    window.addEventListener('pointerup', activateMobileButton, true);
    window.addEventListener('touchstart', absorbMobileButtonEvent, { capture: true, passive: false });
    window.addEventListener('touchend', activateMobileButton, { capture: true, passive: false });
    window.addEventListener('click', activateMobileButton, true);
    state.mobileInputHandlersInstalled = true;
}

function removeMobileInputHandlers() {
    if (!state.mobileInputHandlersInstalled) return;

    window.removeEventListener('pointerdown', absorbMobileButtonEvent, true);
    window.removeEventListener('pointerup', activateMobileButton, true);
    window.removeEventListener('touchstart', absorbMobileButtonEvent, true);
    window.removeEventListener('touchend', activateMobileButton, true);
    window.removeEventListener('click', activateMobileButton, true);
    state.mobileInputHandlersInstalled = false;
}

function createIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');

    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
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

    // Custom JS property to track authenticity
    btn._isLoopTubeBtn = true;

    btn.appendChild(createIcon());

    btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleLoop();
    });

    // Prevent YouTube from stealing the click via mousedown
    btn.addEventListener('mousedown', (e) => e.stopPropagation());

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

    btn._isLoopTubeBtn = true;

    btn.style.setProperty('position', 'absolute', 'important');
    btn.style.setProperty('top', '50%', 'important');
    btn.style.setProperty('right', '15px', 'important');
    btn.style.setProperty('transform', 'translateY(-50%)', 'important');
    btn.style.setProperty('margin', '0', 'important');
    btn.style.setProperty('z-index', '2147483647', 'important');
    btn.style.setProperty('pointer-events', 'auto', 'important');
    btn.style.setProperty('touch-action', 'manipulation', 'important');

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

    btn.addEventListener('pointerdown', absorbMobileButtonEvent);
    btn.addEventListener('pointerup', activateMobileButton);
    btn.addEventListener('touchstart', absorbMobileButtonEvent, { passive: false });
    btn.addEventListener('touchend', activateMobileButton, { passive: false });
    btn.addEventListener('click', activateMobileButton);

    return btn;
}

function placeButton(btn, controls) {
    const ccBtn = controls.querySelector('.ytp-subtitles-button') || controls.querySelector('.ytp-settings-button');

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

        // Ensure the button exists AND is not a dead YouTube clone
        if (oldBtn && oldBtn.parentNode === controls && oldBtn._isLoopTubeBtn) {
            updateButton();
            return;
        }

        // If it's a dead clone, destroy it
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
    installMobileInputHandlers();

    let btn = document.getElementById(BUTTON_ID);

    // Destroy dead clones
    if (btn && !btn._isLoopTubeBtn) {
        btn.remove();
        btn = null;
    }

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
            currentBtn.style.setProperty('pointer-events', isFull ? 'none' : 'auto', 'important');
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
    if (state.adObserver) state.adObserver.disconnect();

    state.observedTarget = target;

    state.domObserver = new MutationObserver(scheduleRun);
    state.domObserver.observe(target, { childList: true, subtree: true });

    if (target === state.player) {
        state.adObserver = new MutationObserver(scheduleRun);
        state.adObserver.observe(target, { attributes: true, attributeFilter: ['class', 'style'] });
    }
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

    if (state.adObserver) {
        state.adObserver.disconnect();
        state.adObserver = null;
    }

    if (state.mobileInterval) {
        clearInterval(state.mobileInterval);
        state.mobileInterval = null;
    }
}
const bgPlay = {
    inited: false,
    interval: null,
    wasPlaying: false,
    eventsBound: false,

    init() {
        this.syncState();
        if (this.inited) return;
        this.inited = true;

        this.injectSpoofer();
        this.bindEvents();
        this.startKeepAlive();
    },

    syncState() {
        // Pass enabled state to the main world via dataset
        document.documentElement.dataset.bgPlay = String(state.enabled);
    },

    injectSpoofer() {
        if (document.getElementById('looptube-spoofer')) return;

        const script = document.createElement('script');
        script.id = 'looptube-spoofer';
        script.textContent = `
            (() => {
                const isActive = () => document.documentElement.dataset.bgPlay === 'true';

                // 1. Preserve and override descriptors safely
                const props = [
                    { obj: Document.prototype, prop: 'hidden', trueVal: false },
                    { obj: Document.prototype, prop: 'webkitHidden', trueVal: false },
                    { obj: Document.prototype, prop: 'visibilityState', trueVal: 'visible' },
                    { obj: Document.prototype, prop: 'webkitVisibilityState', trueVal: 'visible' }
                ];

                props.forEach(({ obj, prop, trueVal }) => {
                    const orig = Object.getOwnPropertyDescriptor(obj, prop);
                    if (!orig) return;

                    Object.defineProperty(document, prop, {
                        configurable: true,
                        enumerable: true,
                        get() {
                            if (isActive()) return trueVal;
                            return orig.get ? orig.get.call(this) : orig.value;
                        }
                    });
                });

                // 2. Main-world event blocking
                const stopEvt = (e) => {
                    if (isActive() && e.isTrusted) {
                        e.stopImmediatePropagation();
                        e.stopPropagation();
                    }
                };

                ['visibilitychange', 'webkitvisibilitychange', 'pagehide', 'blur'].forEach(evt => {
                    document.addEventListener(evt, stopEvt, true);
                    window.addEventListener(evt, stopEvt, true);
                });
            })();
        `;
        (document.head || document.documentElement).appendChild(script);
        script.remove();
    },

    handleEvent(e) {
        if (state.enabled && e.isTrusted) {
            e.stopImmediatePropagation();
            e.stopPropagation();
        }
    },

    bindEvents() {
        if (this.eventsBound) return;
        const evts = ['visibilitychange', 'webkitvisibilitychange', 'pagehide', 'blur'];

        // Bind functions directly to preserve references
        this.boundHandleEvent = this.handleEvent.bind(this);

        evts.forEach(evt => {
            document.addEventListener(evt, this.boundHandleEvent, true);
            window.addEventListener(evt, this.boundHandleEvent, true);
        });
        this.eventsBound = true;
    },
    unbindEvents() {
        if (!this.eventsBound || !this.boundHandleEvent) return;

        const evts = ['visibilitychange', 'webkitvisibilitychange', 'pagehide', 'blur'];

        evts.forEach(evt => {
            document.removeEventListener(evt, this.boundHandleEvent, true);
            window.removeEventListener(evt, this.boundHandleEvent, true);
        });

        this.eventsBound = false;
    },
    startKeepAlive() {
        if (this.interval) clearInterval(this.interval);

        this.interval = setInterval(() => {
            if (!state.enabled || !state.video) return;

            // Firefox isolated worlds (Xray vision) allow extensions to read the REAL document.hidden
            const isReallyHidden = document.hidden;

            if (!isReallyHidden) {
                this.wasPlaying = !state.video.paused;
                return;
            }

            // Auto-resume ONLY if backgrounded, previously playing, and paused by system
            if (isReallyHidden && this.wasPlaying && state.video.paused && !state.video.ended) {
                const p = state.video.play();
                // Safely handle environments where play() doesn't return a Promise
                if (p && typeof p.catch === 'function') {
                    p.catch(() => { });
                }
            }
        }, 800);
    },

    stop() {
        document.documentElement.dataset.bgPlay = 'false';
        this.unbindEvents();
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }
};
function start() {
    if (state.started) return;

    state.started = true;
    state.enabled = true;
    if (isMobile) {
        bgPlay.init();
    }
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
    if (isMobile) {
        bgPlay.stop();
    }

    document.removeEventListener('keydown', handleKeydown, true);
    window.removeEventListener('yt-navigate-finish', handleNavigation);
    window.removeEventListener('yt-page-data-updated', handleNavigation);
    removeMobileInputHandlers();

    if (state.domObserver) state.domObserver.disconnect();
    if (state.videoObserver) state.videoObserver.disconnect();
    if (state.adObserver) state.adObserver.disconnect();

    state.domObserver = null;
    state.videoObserver = null;
    state.adObserver = null;
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
