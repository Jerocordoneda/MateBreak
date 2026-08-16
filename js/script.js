document.addEventListener("DOMContentLoaded", () => {

    const transition = document.querySelector(".matebreak-transition");
    const curve = document.querySelector(".matebreak-curve");

    if (!transition || !curve) return;

    // Valores suavizados (smoothing)
    const LERP = 0.12;

    let targetMove = 0;
    let currentMove = 0;
    let targetScale = 1;
    let currentScale = 1;
    let rafId = null;

    function update() {

        const rect = transition.getBoundingClientRect();
        const windowHeight = window.innerHeight;

        let progress =
            (windowHeight - rect.top) /
            (windowHeight + rect.height);hgghgh

        // Evita valores extremos
        progress = Math.max(0, Math.min(1, progress));

        // Movimiento hacia ARRIBA
        targetMove = progress * -420;

        // La curva CRECE al hacer scroll hacia abajo
        targetScale = 1 + progress * 0.25;

        requestLoop();
    }

    function loop() {

        // Suavizado: la curva se desliza y crece con inercia
        currentMove += (targetMove - currentMove) * LERP;
        currentScale += (targetScale - currentScale) * LERP;

        curve.style.setProperty("--curve-move", `${currentMove}px`);
        curve.style.setProperty("--curve-scale", currentScale);

        if (
            Math.abs(targetMove - currentMove) > 0.05 ||
            Math.abs(targetScale - currentScale) > 0.001
        ) {
            rafId = requestAnimationFrame(loop);
        } else {
            rafId = null;
        }
    }

    function requestLoop() {
        if (rafId == null) {
            rafId = requestAnimationFrame(loop);
        }
    }

    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update, { passive: true });

    update();

});