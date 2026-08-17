// Mantiene el header fijo en negro (fondo oscuro) en toda la página,
// tanto en la parte oscura como en la parte blanca
document.addEventListener("DOMContentLoaded", () => {
    const header = document.querySelector("header");
    if (!header) return;

    header.style.backgroundColor = "rgba(19, 19, 19, 0.9)";
});