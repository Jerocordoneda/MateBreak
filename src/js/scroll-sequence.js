document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-scroll-sequence]').forEach(initSequence);
});

// The same settling time at 60, 120 or 144 Hz; clamp background-tab pauses.
function sequenceInterpolationAlpha(elapsedMs, timeConstantMs = 24) {
    return 1 - Math.exp(-Math.min(64, Math.max(0, elapsedMs)) / timeConstantMs);
}

function initSequence(section) {
    const img = section.querySelector('[data-seq-img]');
    const bar = section.querySelector('[data-seq-bar]');
    const counter = section.querySelector('[data-seq-counter]');
    if (!img) return;
    const homeExperience = section.closest('[data-home]') !== null;
    const staticView = matchMedia(homeExperience
        ? '(max-width: 760px)'
        : '(max-width: 760px), (prefers-reduced-motion: reduce)');
    if (staticView.matches) {
        const activate = () => {
            if (!staticView.matches) { staticView.removeEventListener('change', activate); initSequence(section); }
        };
        staticView.addEventListener('change', activate);
        return;
    }

    const total = parseInt(section.dataset.seqFrames || '60', 10);
    const dir = section.dataset.seqDir || 'src/assets/images/frames-mate1';
    const frames = Array.from({length: total}, (_, index) => {
        const n = index + 1;
        const suffix = n > 1 && n <= 47 ? '-convertido-de-png' : '';
        return `${dir}/ezgif-frame-${String(n).padStart(3, '0')}-removebg-preview${suffix}.webp`;
    });
    const decoded = new Map();
    const failed = new Set();
    const loading = new Set();
    let desired = [];
    let engaged = false;
    let targetProgress = 0, currentProgress = 0, currentFrame = -1;
    let visible = false, rafId = null, previousTime = null;

    // Only the requested frame and its nearby trajectory, with two decodes in flight.
    // Keep decoded images (at most the original 60) so reverse scroll never reloads them.
    function pump() {
        if (!visible || staticView.matches || document.hidden) return;
        while (loading.size < 2) {
            const frame = desired.find(n => !decoded.has(n) && !loading.has(n) && !failed.has(n));
            if (frame === undefined) break;
            loading.add(frame);
            const pre = new Image();
            const finish = () => { loading.delete(frame); pump(); requestLoop(); };
            pre.onload = async () => {
                try { await pre.decode(); decoded.set(frame, pre); }
                catch { failed.add(frame); }
                finish();
            };
            pre.onerror = () => { failed.add(frame); finish(); };
            pre.src = frames[frame];
        }
    }

    function prepare(frame) {
        const direction = targetProgress >= currentProgress ? 1 : -1;
        desired = [frame];
        for (let distance = 1; distance <= 6; distance++) {
            desired.push(frame + direction * distance, frame - direction * distance);
        }
        desired = desired.filter(n => n >= 0 && n < total);
        // Complete the bounded cache only after the user actually scrolls the
        // visible sequence; nearby frames retain priority over background work.
        if (engaged) for (let distance = 7; distance < total; distance++) {
            for (const n of [frame + direction * distance, frame - direction * distance]) {
                if (n >= 0 && n < total) desired.push(n);
            }
        }
        pump();
    }

    function stop() {
        if (rafId !== null) cancelAnimationFrame(rafId);
        rafId = null; previousTime = null;
    }

    function update() {
        if (staticView.matches) {
            stop(); visible = false;
            img.src = frames[0]; img.style.filter = ''; img.style.opacity = '1';
            currentFrame = -1; currentProgress = 0;
            return;
        }
        const rect = section.getBoundingClientRect(), vh = window.innerHeight;
        targetProgress = Math.max(0, Math.min(1, (vh - rect.top) / rect.height));
        const wasVisible = visible;
        visible = rect.bottom > 0 && rect.top < vh;
        if (!visible || document.hidden) { stop(); return; }
        if (!wasVisible) currentProgress = targetProgress;
        prepare(Math.round(targetProgress * (total - 1)));
        requestLoop();
    }

    function loop(time) {
        rafId = null;
        if (!visible || staticView.matches || document.hidden) { previousTime = null; return; }
        const elapsed = previousTime === null ? 1000 / 60 : time - previousTime;
        previousTime = time;
        currentProgress += (targetProgress - currentProgress) * sequenceInterpolationAlpha(elapsed);
        if (Math.abs(targetProgress - currentProgress) <= 0.0005) currentProgress = targetProgress;
        const frame = Math.round(currentProgress * (total - 1));
        // Never display an undecoded image or fade each photograph: that caused flicker.
        if (frame !== currentFrame && decoded.has(frame)) {
            currentFrame = frame; img.src = frames[frame];
            if (counter) counter.textContent = String(frame + 1).padStart(2, '0');
        }
        prepare(frame);
        if (bar) bar.style.transform = `scaleX(${currentProgress.toFixed(4)})`;
        if (currentProgress !== targetProgress) requestLoop();
        else previousTime = null;
    }

    function requestLoop() {
        if (rafId === null && visible && !staticView.matches && !document.hidden) rafId = requestAnimationFrame(loop);
    }
    window.addEventListener('scroll', () => { if (visible) engaged = true; update(); }, {passive: true});
    window.addEventListener('resize', update, {passive: true});
    document.addEventListener('visibilitychange', update);
    staticView.addEventListener('change', update);
    update();
}
