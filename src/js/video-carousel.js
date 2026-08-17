(function () {
    "use strict";

    var DEFAULT_ITEMS = [
        { url: "src/assets/videos/Download.mp4", poster: "" },
        { url: "src/assets/videos/Download%20%281%29.mp4", poster: "" },
        { url: "src/assets/videos/Download%20%282%29.mp4", poster: "" },
        { url: "src/assets/videos/Download%20%283%29.mp4", poster: "" }
    ];

    var CHEV_PREV = '<svg width="18" height="18" viewBox="0 0 24 24" style="transform:rotate(180deg)"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    var CHEV_NEXT = '<svg width="18" height="18" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    var MUTE_OFF_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5L6 9H2v6h4l5 4V5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M16.5 9.5l5 5m0-5l-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    var MUTE_ON_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5L6 9H2v6h4l5 4V5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M15.5 8.5a5 5 0 010 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M18.5 5.5a9 9 0 010 13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.9"/></svg>';

    var injected = false;

    function injectStyles() {
        if (injected) return;
        injected = true;
        var st = document.createElement("style");
        st.id = "vc-styles";
        st.textContent = [
            "[data-video-carousel]{position:relative;width:100%;display:flex;align-items:center;justify-content:center;overflow:hidden;user-select:none;-webkit-user-select:none;touch-action:pan-y;outline:none;}",
            "[data-video-carousel] .vc-stage{position:relative;transform-style:preserve-3d;}",
            "[data-video-carousel] .vc-card{position:absolute;top:50%;left:50%;overflow:hidden;background:#000;transform-style:preserve-3d;will-change:transform,opacity,filter;transition:transform .75s cubic-bezier(.32,1.4,.5,1),opacity .5s ease,filter .5s ease;}",
            "[data-video-carousel] .vc-card video{width:100%;height:100%;object-fit:cover;display:block;}",
            "[data-video-carousel] .vc-shade{position:absolute;inset:0;pointer-events:none;}",
            "[data-video-carousel] .vc-mute{position:absolute;top:10px;right:10px;width:34px;height:34px;border-radius:999px;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;background:var(--vc-ui-bg,#fff);color:var(--vc-ui-color,#000);z-index:2;}",
            "[data-video-carousel] .vc-arrow{position:absolute;top:50%;transform:translateY(-50%);width:36px;height:36px;border-radius:999px;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;background:var(--vc-ui-bg,#fff);color:var(--vc-ui-color,#000);z-index:3;}",
            "[data-video-carousel] .vc-arrow.vc-prev{left:12px;}",
            "[data-video-carousel] .vc-arrow.vc-next{right:12px;}",
            "[data-video-carousel] .vc-dot{width:8px;height:8px;border-radius:999px;border:none;padding:0;cursor:pointer;}"
        ].join("");
        document.head.appendChild(st);
    }

    function getConfig(mount) {
        var small = window.innerWidth < 640;
        var items = DEFAULT_ITEMS;
        if (mount.dataset.items) {
            try {
                items = JSON.parse(mount.dataset.items);
            } catch (e) {
                items = DEFAULT_ITEMS;
            }
        }
        return {
            items: items,
            orientation: mount.dataset.orientation || "horizontal",
            cardWidth: small ? 203 : 339,
            cardHeight: small ? 343 : 572,
            spacing: small ? 102 : 170,
            depth: small ? 250 : 420,
            perspective: small ? 650 : 900,
            radius: "16px",
            inactiveBlur: 2,
            inactiveScale: 0.91,
            hoverZoom: 1.03,
            inactiveOpacity: 1,
            mutedDefault: true,
            loop: true,
            autoAdvance: false,
            autoAdvanceSeconds: 4,
            uiColor: "#000000",
            uiBackground: "#FFFFFF"
        };
    }

    function hexToRgba(color, alpha) {
        var c = String(color || "").trim();
        var m = c.match(/^rgba?\(([^)]+)\)$/i);
        if (m) {
            var parts = m[1].split(",").map(function (p) { return p.trim(); });
            var r0 = Number(parts[0]), g0 = Number(parts[1]), b0 = Number(parts[2]);
            if (isNaN(r0) || isNaN(g0) || isNaN(b0)) return c;
            return "rgba(" + r0 + "," + g0 + "," + b0 + "," + alpha + ")";
        }
        var hex = c.replace(/^#/, "");
        if (hex.length === 3 || hex.length === 6) {
            var full = hex.length === 3 ? hex.split("").map(function (ch) { return ch + ch; }).join("") : hex;
            var r = parseInt(full.slice(0, 2), 16);
            var g = parseInt(full.slice(2, 4), 16);
            var b = parseInt(full.slice(4, 6), 16);
            if (isNaN(r) || isNaN(g) || isNaN(b)) return c;
            return "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
        }
        return c;
    }

    function wrap(i, n) {
        return ((i % n) + n) % n;
    }

    function clamp(i, n) {
        return Math.max(0, Math.min(n - 1, i));
    }

    function initCarousel(mount) {
        injectStyles();
        var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        var cfg = getConfig(mount);
        var count = cfg.items.length;
        var active = 0;
        var muted = cfg.mutedDefault;
        var inView = false;
        var dragging = false;
        var dragStart = null;
        var autoId = null;
        var videos = [];
        var cards = [];

        if (count <= 0) return;

        mount.setAttribute("role", "region");
        mount.setAttribute("aria-label", "Video carousel");

        var stage = document.createElement("div");
        stage.className = "vc-stage";
        mount.appendChild(stage);

        for (var i = 0; i < count; i++) {
            var card = document.createElement("div");
            card.className = "vc-card";
            var video = document.createElement("video");
            video.src = cfg.items[i].url;
            if (cfg.items[i].poster) video.setAttribute("poster", cfg.items[i].poster);
            video.muted = true;
            video.playsInline = true;
            video.loop = true;
            video.preload = "metadata";
            card.appendChild(video);
            var shade = document.createElement("div");
            shade.className = "vc-shade";
            card.appendChild(shade);
            stage.appendChild(card);
            videos.push(video);
            cards.push(card);
        }

        var muteBtn = document.createElement("button");
        muteBtn.type = "button";
        muteBtn.className = "vc-mute";
        muteBtn.addEventListener("pointerdown", function (e) { e.stopPropagation(); });
        muteBtn.addEventListener("pointerup", function (e) { e.stopPropagation(); });
        muteBtn.addEventListener("click", function (e) {
            e.stopPropagation();
            muted = !muted;
            renderMute();
            syncPlayback();
        });

        var prevBtn = document.createElement("button");
        prevBtn.type = "button";
        prevBtn.className = "vc-arrow vc-prev";
        prevBtn.setAttribute("aria-label", "Anterior");
        prevBtn.innerHTML = CHEV_PREV;
        prevBtn.addEventListener("pointerdown", function (e) { e.stopPropagation(); });
        prevBtn.addEventListener("pointerup", function (e) { e.stopPropagation(); });
        prevBtn.addEventListener("click", function (e) { e.stopPropagation(); goTo(active - 1); });

        var nextBtn = document.createElement("button");
        nextBtn.type = "button";
        nextBtn.className = "vc-arrow vc-next";
        nextBtn.setAttribute("aria-label", "Siguiente");
        nextBtn.innerHTML = CHEV_NEXT;
        nextBtn.addEventListener("pointerdown", function (e) { e.stopPropagation(); });
        nextBtn.addEventListener("pointerup", function (e) { e.stopPropagation(); });
        nextBtn.addEventListener("click", function (e) { e.stopPropagation(); goTo(active + 1); });

        if (count > 1) {
            mount.appendChild(prevBtn);
            mount.appendChild(nextBtn);
        }

        function goTo(raw) {
            if (count <= 0) return;
            active = cfg.loop ? wrap(raw, count) : clamp(raw, count);
            layout();
            syncPlayback();
            if (cfg.autoAdvance) startAuto();
        }

        function layout() {
            var cw = cfg.cardWidth;
            var ch = cfg.cardHeight;
            var half = Math.floor(count / 2);
            var clusterW = cw + cfg.depth * 0.35 * 2 + cfg.spacing * 2;
            var clusterH = ch + cfg.depth * 0.35 * 2;

            stage.style.width = clusterW + "px";
            stage.style.height = clusterH + "px";
            mount.style.height = clusterH + "px";
            mount.style.perspective = cfg.perspective + "px";

            cards.forEach(function (card, i) {
                var rel = i - active;
                if (cfg.loop && count > 2) {
                    if (rel > half) rel -= count;
                    if (rel < -half) rel += count;
                }
                var abs = Math.abs(rel);
                var tx = rel * cfg.spacing;
                var tz = -abs * cfg.depth * 0.35;
                var rot = rel * -26;
                var isActive = rel === 0;
                var scale = isActive ? 1 : cfg.inactiveScale;
                var blur = isActive ? 0 : cfg.inactiveBlur;
                var opacity = abs > 3 ? 0 : 1 - Math.min(0.75, abs * 0.18);
                if (!isActive) opacity *= cfg.inactiveOpacity;

                var base;
                if (reduced) {
                    base = "";
                } else if (cfg.orientation === "vertical") {
                    base = "translateY(" + tx + "px) translateZ(" + tz + "px) rotateX(" + (-rot) + "deg)";
                } else {
                    base = "translateX(" + tx + "px) translateZ(" + tz + "px) rotateY(" + rot + "deg)";
                }

                card.style.width = cw + "px";
                card.style.height = ch + "px";
                card.style.marginLeft = (-cw / 2) + "px";
                card.style.marginTop = (-ch / 2) + "px";
                card.style.borderRadius = cfg.radius;
                card.style.opacity = opacity;
                card.style.filter = "blur(" + blur + "px)";
                card.style.transform = base + " scale(" + scale + ")";
                card.style.pointerEvents = isActive ? "auto" : "none";
                card.querySelector(".vc-shade").style.background = isActive
                    ? "transparent"
                    : "linear-gradient(180deg, rgba(0,0,0,0.10), rgba(0,0,0,0.20))";

                card.onpointerenter = function () {
                    if (active === i && !reduced) {
                        card.style.transform = base + " scale(" + cfg.hoverZoom + ")";
                        card.style.filter = "blur(0px)";
                    }
                };
                card.onpointerleave = function () {
                    card.style.transform = base + " scale(" + scale + ")";
                    card.style.filter = "blur(" + blur + "px)";
                };

                if (isActive) card.appendChild(muteBtn);
            });
        }

        function renderMute() {
            muteBtn.innerHTML = muted ? MUTE_OFF_SVG : MUTE_ON_SVG;
            muteBtn.setAttribute("aria-label", muted ? "Activar sonido" : "Silenciar");
        }

        function syncPlayback() {
            videos.forEach(function (v, i) {
                if (!v) return;
                var isActive = i === active;
                try {
                    if (!inView || !isActive) {
                        v.pause();
                    } else {
                        v.muted = muted;
                        var p = v.play();
                        if (p && p.catch) p.catch(function () {});
                    }
                } catch (e) {}
            });
        }

        function startAuto() {
            stopAuto();
            if (!cfg.autoAdvance || count <= 1) return;
            autoId = setInterval(function () { goTo(active + 1); }, Math.max(0.5, cfg.autoAdvanceSeconds) * 1000);
        }

        function stopAuto() {
            if (autoId) clearInterval(autoId);
            autoId = null;
        }

        var io = new IntersectionObserver(function (entries) {
            inView = entries[0].isIntersecting;
            if (inView) {
                syncPlayback();
                startAuto();
            } else {
                videos.forEach(function (v) { try { v.pause(); } catch (e) {} });
                stopAuto();
            }
        }, { threshold: 0.35 });
        io.observe(mount);

        stage.addEventListener("pointerdown", function (e) {
            if (count <= 1) return;
            stage.setPointerCapture(e.pointerId);
            dragging = true;
            dragStart = { x: e.clientX, y: e.clientY };
        });
        stage.addEventListener("pointermove", function () {});
        stage.addEventListener("pointerup", function (e) {
            if (!dragging || !dragStart) return;
            var dx = e.clientX - dragStart.x;
            var dy = e.clientY - dragStart.y;
            var delta = cfg.orientation === "vertical" ? dy : dx;
            dragging = false;
            dragStart = null;
            if (Math.abs(delta) < 24) return;
            goTo(delta < 0 ? active + 1 : active - 1);
        });
        stage.addEventListener("pointercancel", function () {
            dragging = false;
            dragStart = null;
        });

        mount.tabIndex = 0;
        mount.addEventListener("keydown", function (e) {
            if (e.key === "ArrowLeft") goTo(active - 1);
            if (e.key === "ArrowRight") goTo(active + 1);
        });

        var resizeT = null;
        window.addEventListener("resize", function () {
            clearTimeout(resizeT);
            resizeT = setTimeout(function () {
                cfg = getConfig(mount);
                layout();
            }, 150);
        });

        layout();
        renderMute();
        syncPlayback();
        if (cfg.autoAdvance) startAuto();
    }

    document.addEventListener("DOMContentLoaded", function () {
        var mounts = document.querySelectorAll("[data-video-carousel]");
        for (var i = 0; i < mounts.length; i++) {
            initCarousel(mounts[i]);
        }
    });
})();
