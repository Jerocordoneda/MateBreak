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

    const total = parseInt(section.dataset.seqFrames || "30", 10);
    const dir = section.dataset.seqDir || "src/assets/images/frames-mate1";
    const LERP = 0.12;

    const frames = [];
    for (let i = 1; i <= total; i++) {
        const name =
            i === 1
                ? "ezgif-frame-001-removebg-preview.webp"
                : "ezgif-frame-" + String(i).padStart(3, "0") + "-removebg-preview-convertido-de-png.webp";
        frames.push(dir + "/" + name);
    }

    frames.forEach((src) => {
        const pre = new Image();
        pre.src = src;
    });

    let targetProgress = 0;
    let currentProgress = 0;
    let currentFrame = -1;
    let rafId = null;

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
            if (counter) counter.textContent = String(frame + 1).padStart(2, "0");
        }

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