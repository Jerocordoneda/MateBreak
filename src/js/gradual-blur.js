// GradualBlur (adaptado a vanilla JS del componente de Ansh - github.com/ansh-dhanani)
// Config: target=page, position=bottom, height=7rem, strength=2, divCount=5,
//         curve=bezier, exponential, opacity=1
(function () {
    if (typeof document === "undefined") return;
    if (document.querySelector(".gradual-blur-page")) return;

    var divCount = 5;
    var strength = 2;
    var height = "7rem";
    var opacity = 1;
    var zIndex = 60;

    function bezier(p) {
        return p * p * (3 - 2 * p);
    }

    var container = document.createElement("div");
    container.className = "gradual-blur gradual-blur-page";
    container.style.cssText =
        "position:fixed;bottom:0;left:0;right:0;height:" + height +
        ";pointer-events:none;opacity:" + opacity +
        ";z-index:" + zIndex + ";isolation:isolate;";

    var inner = document.createElement("div");
    inner.className = "gradual-blur-inner";
    inner.style.cssText = "position:relative;width:100%;height:100%;";

    var increment = 100 / divCount;

    for (var i = 1; i <= divCount; i++) {
        var progress = bezier(i / divCount);
        var blurValue = Math.pow(2, progress * 4) * 0.0625 * strength;

        var p1 = Math.round((increment * i - increment) * 10) / 10;
        var p2 = Math.round(increment * i * 10) / 10;
        var p3 = Math.round((increment * i + increment) * 10) / 10;
        var p4 = Math.round((increment * i + increment * 2) * 10) / 10;

        var gradient = "transparent " + p1 + "%, black " + p2 + "%";
        if (p3 <= 100) gradient += ", black " + p3 + "%";
        if (p4 <= 100) gradient += ", transparent " + p4 + "%";

        var div = document.createElement("div");
        div.style.cssText =
            "position:absolute;inset:0;" +
            "mask-image:linear-gradient(to bottom, " + gradient + ");" +
            "-webkit-mask-image:linear-gradient(to bottom, " + gradient + ");" +
            "backdrop-filter:blur(" + blurValue.toFixed(3) + "rem);" +
            "-webkit-backdrop-filter:blur(" + blurValue.toFixed(3) + "rem);" +
            "opacity:" + opacity + ";";

        inner.appendChild(div);
    }

    container.appendChild(inner);
    document.body.appendChild(container);
})();