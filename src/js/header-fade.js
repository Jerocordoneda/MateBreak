// El header se funde con el fondo: su color interpola suavemente entre
// oscuro y claro según la posición de la línea dorada de .matebreak-curve,
// y tanto el fondo como el blur se desvanecen hacia abajo (sin borde duro).
document.addEventListener("DOMContentLoaded", () => {
    const header = document.querySelector("header");
    if (!header) return;

    const DARK = [19, 19, 19];       // fondo base del sitio (#131313)
    const WHITE = [255, 255, 255];
    const FADE_RANGE = 200;          // px de anticipación del difuminado

    // Capa de blur con máscara: se disuelve hacia abajo junto al fondo.
    let blurLayer = header.querySelector(".header-fade-blur");
    if (!blurLayer) {
        blurLayer = document.createElement("div");
        blurLayer.className = "header-fade-blur";
        header.insertBefore(blurLayer, header.firstChild);
    }

    header.style.backgroundColor = "transparent";

    const transitionEl = document.querySelector(".matebreak-transition");
    const curve = document.querySelector(".matebreak-curve");

    // Y en viewport del "límite de color": el borde superior de la curva
    // (donde está dibujada la línea dorada), o del primer sector blanco
    // en páginas sin curva.
    function colorBoundary() {
        if (transitionEl && curve) {
            const rect = transitionEl.getBoundingClientRect();
            const move = parseFloat(curve.style.getPropertyValue("--curve-move")) || 0;
            const scale = parseFloat(curve.style.getPropertyValue("--curve-scale")) || 1;
            return rect.top + 700 + move - 300 * scale;
        }
        const light = document.querySelector("section.bg-white, footer.bg-white");
        return light ? light.getBoundingClientRect().top : null;
    }

    function lerp(a, b, t) { return a + (b - a) * t; }
    function smooth(t) { return t * t * (3 - 2 * t); }
    function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

    let lastP = -1;
    let lastLight = null;

    function frame() {
        const headerBottom = header.offsetHeight;
        const y = colorBoundary();

        let p = 0;
        if (typeof y === "number" && isFinite(y)) {
            // p=0 oscuro; p=1 blanco justo cuando la línea toca el header
            p = clamp01((headerBottom + FADE_RANGE - y) / FADE_RANGE);
        }

        if (Math.abs(p - lastP) > 0.001 || lastP < 0) {
            const t = smooth(p);
            const r = Math.round(lerp(DARK[0], WHITE[0], t));
            const g = Math.round(lerp(DARK[1], WHITE[1], t));
            const b = Math.round(lerp(DARK[2], WHITE[2], t));

            // Degradado: casi sólido arriba, se disuelve al llegar abajo
            header.style.background =
                "linear-gradient(to bottom," +
                " rgba(" + r + ", " + g + ", " + b + ", 0.95) 0%," +
                " rgba(" + r + ", " + g + ", " + b + ", 0.85) 40%," +
                " rgba(" + r + ", " + g + ", " + b + ", 0.5) 75%," +
                " rgba(" + r + ", " + g + ", " + b + ", 0) 100%)";

            const isLight = p > 0.5;
            if (isLight !== lastLight) {
                lastLight = isLight;
                header.classList.toggle("header-dark", isLight);
            }
            lastP = p;
        }

        requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
});
