// Difumina el fondo del header al hacer scroll, manteniendo fijas las 2 líneas
document.addEventListener("DOMContentLoaded", () => {
    const header = document.querySelector("header");
    if (!header) return;

    const FADE_DISTANCE = 200; // px deslizados para difuminar el fondo por completo
    const BASE_ALPHA = 0.9; // coincide con bg-surface/90 (color surface #131313)
    const SURFACE = "19, 19, 19";
    let rafId = null;

    function update() {
        const y = window.scrollY;
        const fade = Math.min(1, y / FADE_DISTANCE);

        // Solo se desvanece el fondo oscuro: las líneas quedan fijas y
        // el backdrop-blur (frosted glass) sigue difuminando la página detrás
        const alpha = BASE_ALPHA * (1 - fade);
        header.style.backgroundColor = "rgba(" + SURFACE + ", " + alpha.toFixed(3) + ")";

        rafId = null;
    }

    function requestUpdate() {
        if (rafId == null) {
            rafId = requestAnimationFrame(update);
        }
    }

    // El desvanecido se controla por JS para que responda al scroll
    header.style.transition = "none";

    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate, { passive: true });

    update();
});