// El header pasa a fondo blanco con letras negras cuando las secciones
// blancas de la página pasan por debajo; vuelve al negro en la parte oscura
document.addEventListener("DOMContentLoaded", () => {
    const header = document.querySelector("header");
    if (!header) return;

    const DARK = "19, 19, 19";
    const WHITE = "255, 255, 255";

    function apply() {
        const dark = header.classList.contains("header-dark");
        header.style.backgroundColor = dark
            ? "rgba(" + WHITE + ", 0.95)"
            : "rgba(" + DARK + ", 0.9)";
    }

    const whiteSections = document.querySelectorAll("section.bg-white, footer.bg-white");
    if (whiteSections.length) {
        const io = new IntersectionObserver(
            (entries) => {
                const dark = entries.some((e) => e.isIntersecting);
                header.classList.toggle("header-dark", dark);
                apply();
            },
            { rootMargin: "-128px 0px 0px 0px", threshold: 0 }
        );
        whiteSections.forEach((s) => io.observe(s));
    }

    apply();
});