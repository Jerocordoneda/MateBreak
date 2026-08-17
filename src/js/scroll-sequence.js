document.addEventListener("DOMContentLoaded", () => {
    const sections = document.querySelectorAll("[data-scroll-sequence]");
    if (!sections.length) return;

    sections.forEach(initSequence);
});

function initSequence(section) {
    const img = section.querySelector("[data-seq-img]");
    const bar = section.querySelector("[data-seq-bar]");
    const counter = section.querySelector("[data-seq-counter]");
    if (!img) return;

    const total = parseInt(section.dataset.seqFrames || "60", 10);
    const dir = section.dataset.seqDir || "src/assets/images/frames-mate1";
    const LERP = 0.3;

    const frames = [];
    for (let i = 1; i <= total; i++) {
        const name =
            i === 1
                ? "ezgif-frame-001-removebg-preview.webp"
                : i <= 47
                    ? "ezgif-frame-" + String(i).padStart(3, "0") + "-removebg-preview-convertido-de-png.webp"
                    : "ezgif-frame-" + String(i).padStart(3, "0") + "-removebg-preview.webp";
        frames.push(dir + "/" + name);
    }

    const brightness = {};

    function analyze(src) {
        const pre = new Image();
        pre.onload = () => {
            try {
                const c = document.createElement("canvas");
                c.width = 24;
                c.height = 24;
                const ctx = c.getContext("2d");
                ctx.drawImage(pre, 0, 0, 24, 24);
                const data = ctx.getImageData(0, 0, 24, 24).data;
                let sum = 0;
                let count = 0;
                for (let i = 0; i < data.length; i += 4) {
                    if (data[i + 3] < 128) continue;
                    sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                    count++;
                }
                const avg = count ? sum / count : 128;
                brightness[src] = Math.max(0.92, Math.min(1.08, 128 / avg));
            } catch (e) {
                brightness[src] = 1;
            }
        };
        pre.src = src;
    }

    frames.forEach(analyze);

    let targetProgress = 0;
    let currentProgress = 0;
    let currentFrame = -1;
    let rafId = null;
    let targetBrightness = 1;
    let currentBrightness = 1;

    function update() {
        const rect = section.getBoundingClientRect();
        const vh = window.innerHeight;
        const range = rect.height - vh;
        targetProgress = range > 0 ? (vh - rect.top) / (vh + range) : 0;
        targetProgress = Math.max(0, Math.min(1, targetProgress));
        requestLoop();
    }

    function loop() {
        currentProgress += (targetProgress - currentProgress) * LERP;

        const frame = Math.round(currentProgress * (frames.length - 1));
        if (frame !== currentFrame) {
            currentFrame = frame;
            img.src = frames[frame];
            targetBrightness = brightness[frames[frame]] || 1;
            img.style.opacity = "0.75";
            requestAnimationFrame(() => {
                img.style.opacity = "1";
            });
            if (counter) counter.textContent = String(frame + 1).padStart(2, "0");
        }

        currentBrightness += (targetBrightness - currentBrightness) * 0.03;
        img.style.filter =
            "brightness(" + (Math.abs(targetBrightness - currentBrightness) > 0.002 ? currentBrightness : targetBrightness).toFixed(3) + ")";

        if (bar) bar.style.transform = "scaleX(" + currentProgress.toFixed(4) + ")";

        if (Math.abs(targetProgress - currentProgress) > 0.0005) {
            rafId = requestAnimationFrame(loop);
        } else {
            rafId = null;
        }
    }

    function requestLoop() {
        if (rafId == null) rafId = requestAnimationFrame(loop);
    }

    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update, { passive: true });

    update();
}