// El header cambia de negro a blanco SOLO cuando la línea dorada
// de .matebreak-curve toca el borde inferior del header.
// Permanece blanco hasta que la línea lo vuelve a tocar al subir, y así siempre.
document.addEventListener("DOMContentLoaded", () => {
    const header = document.querySelector("header");
    if (!header) return;

    const DARK = "19, 19, 19";
    const WHITE = "255, 255, 255";

    function apply(isWhite) {
        header.classList.toggle("header-dark", isWhite);
        header.style.backgroundColor = isWhite
            ? "rgba(" + WHITE + ", 0.95)"
            : "rgba(" + DARK + ", 0.9)";
    }

    const transition = document.querySelector(".matebreak-transition");
    const curve = document.querySelector(".matebreak-curve");

    // Páginas sin curva: comportamiento clásico (solo secciones blancas)
    if (!transition || !curve) {
        const whiteSections = document.querySelectorAll("section.bg-white, footer.bg-white");
        if (whiteSections.length) {
            const io = new IntersectionObserver(
                (entries) => {
                    const isWhite = entries.some((e) => e.isIntersecting);
                    apply(isWhite);
                },
                { rootMargin: "-128px 0px 0px 0px", threshold: 0 }
            );
            whiteSections.forEach((s) => io.observe(s));
        }
        apply(false);
        return;
    }

    // Geometría de .matebreak-curve (height 600px, bottom -500px, dentro de
    // un contenedor de 500px): su borde superior = centro + move - 300 * scale,
    // con centro = rect.top + 700. Ahí está dibujada la línea dorada.
    function curveTopEdge() {
        const rect = transition.getBoundingClientRect();
        const move = parseFloat(curve.style.getPropertyValue("--curve-move")) || 0;
        const scale = parseFloat(curve.style.getPropertyValue("--curve-scale")) || 1;
        return rect.top + 700 + move - 300 * scale;
    }

    const headerBottom = header.offsetHeight;
    let lastWhite = null;

    function loop() {
        const isWhite = curveTopEdge() < headerBottom;
        if (isWhite !== lastWhite) {
            lastWhite = isWhite;
            apply(isWhite);
        }
        requestAnimationFrame(loop);
    }

    requestAnimationFrame(loop);
});