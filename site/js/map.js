require([
    "esri/Map",
    "esri/views/MapView",
    "esri/layers/WebTileLayer",
    "esri/layers/support/TileInfo",
    "esri/widgets/ScaleBar",
    "esri/widgets/Home",
    "esri/widgets/Compass",
    "esri/widgets/Fullscreen",
    "esri/Basemap"
], function (
    Map, MapView, WebTileLayer, TileInfo,
    ScaleBar, Home, Compass, Fullscreen, Basemap
) {
    const OSM_MAX_ZOOM = 19;

    // ---- 疊加層共用 TileInfo ----
    const tileInfo = new TileInfo({
        dpi: 96, rows: 256, cols: 256,
        origin: { x: -20037508.3427892, y: 20037508.3427892 },
        spatialReference: { wkid: 102100 },
        lods: [
            { level: 0, resolution: 156543.033928, scale: 591657527.591555 },
            { level: 1, resolution: 78271.516964, scale: 295828763.795777 },
            { level: 2, resolution: 39135.758482, scale: 147914381.897889 },
            { level: 3, resolution: 19567.879241, scale: 73957190.948944 },
            { level: 4, resolution: 9783.9396205, scale: 36978595.474472 },
            { level: 5, resolution: 4891.96981025, scale: 18489297.737236 },
            { level: 6, resolution: 2445.984905125, scale: 9244648.868618 },
            { level: 7, resolution: 1222.9924525625, scale: 4622324.434309 },
            { level: 8, resolution: 611.49622628125, scale: 2311162.217155 },
            { level: 9, resolution: 305.748113140625, scale: 1155581.108577 },
            { level: 10, resolution: 152.8740565703125, scale: 577790.554289 },
            { level: 11, resolution: 76.43702828515625, scale: 288895.277144 },
            { level: 12, resolution: 38.218514142578125, scale: 144447.638572 },
            { level: 13, resolution: 19.109257071289063, scale: 72223.819286 },
            { level: 14, resolution: 9.554628535644531, scale: 36111.909643 },
            { level: 15, resolution: 4.777314267822266, scale: 18055.954822 },
            { level: 16, resolution: 2.388657133911133, scale: 9027.977411 },
            { level: 17, resolution: 1.1943285669555664, scale: 4513.988705 },
            { level: 18, resolution: 0.5971642834777832, scale: 2256.994353 },
            { level: 19, resolution: 0.2985821417388916, scale: 1128.497176 },
            { level: 20, resolution: 0.1492910708694458, scale: 564.248588 },
            { level: 21, resolution: 0.0746455354347229, scale: 282.124294 },
            { level: 22, resolution: 0.03732276771736145, scale: 141.062147 }
        ]
    });

    // ---- 初始 OSM 底圖 ----
    const getOpacity = () =>
        parseFloat(document.getElementById("basemapOpacity").value) || 1;

    const osmLayer = new WebTileLayer({
        urlTemplate: "https://{subDomain}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        subDomains: ["a", "b", "c"],
        copyright: "© OpenStreetMap contributors",
        crossOrigin: "anonymous",
        spatialReference: { wkid: 102100 },
        opacity: getOpacity()
    });

    const osmBasemap = new Basemap({ baseLayers: [osmLayer], referenceLayers: [] });
    const map = new Map({ basemap: osmBasemap });

    const view = new MapView({
        container: "viewDiv",
        map,
        center: [121.56, 25.04],
        zoom: 13,
        spatialReference: { wkid: 102100 }
    });

    // ---- UI ----
    view.ui.move("zoom", "top-left");
    view.ui.add(new ScaleBar({ view, unit: "metric" }), "bottom-left");
    view.ui.add(new Home({ view }), "top-left");
    view.ui.add(new Compass({ view }), "top-left");
    view.ui.add(new Fullscreen({ view }), "top-right");

    // ---- 右下角固定 XY（加節流避免過多運算）----
    const xyDiv = document.getElementById("xyCoords");
    let lastXYUpdate = 0;
    function updateXYFrom(evt) {
        const now = performance.now();
        if (now - lastXYUpdate < 50) return; // ~20fps 更新即可
        lastXYUpdate = now;

        const p = view.toMap({ x: evt.x, y: evt.y });
        if (p && xyDiv) {
            xyDiv.textContent = `${p.longitude.toFixed(6)}°, ${p.latitude.toFixed(6)}°`;
        }
    }
    view.on("pointer-move", updateXYFrom);
    view.when(() => {
        const c = view.center;
        if (xyDiv) xyDiv.textContent = `${c.longitude.toFixed(6)}°, ${c.latitude.toFixed(6)}°`;
    });

    // ---- 底圖透明度 ----
    const opacityInput = document.getElementById("basemapOpacity");
    const opacityValue = document.getElementById("basemapOpacityValue");
    opacityInput.addEventListener("input", function () {
        const v = getOpacity();
        opacityValue.textContent = v.toFixed(1);
        const bl = map.basemap.baseLayers.getItemAt(0);
        if (bl && "opacity" in bl) bl.opacity = v;
    });

    // ---- 底圖切換 ----
    document.getElementById("basemapSelect").addEventListener("change", function (e) {
        const selected = e.target.value;
        const v = getOpacity();

        if (selected === "osm" || selected === "OpenStreetMap") {
            map.basemap = osmBasemap;
            const bl = map.basemap.baseLayers.getItemAt(0);
            if (bl) bl.opacity = v;

            if (view.zoom > OSM_MAX_ZOOM) {
                view.goTo({ zoom: OSM_MAX_ZOOM }).catch(() => { });
            }
        } else {
            map.basemap = selected;
            const bl = map.basemap.baseLayers.getItemAt(0);
            if (bl) bl.when(() => { if ("opacity" in bl) bl.opacity = v; });
        }
    });

    // ---- 從 API 建立群組（預設只顯示 ImageType 標題；點開才顯示控制）----
    fetch("./data/wmtslayer.json")
        .then(r => r.json())
        .then(data => {
            const grouped = {};
            data.forEach(item => {
                (grouped[item.ImageType] ||= []).push(item);
            });

            const container = document.getElementById("imageGroups");
            container.innerHTML = "";

            Object.entries(grouped).forEach(([type, layers]) => {
                // <details class="group">
                const details = document.createElement("details");
                details.className = "group"; // index.cshtml 已定義樣式
                // 預設關閉，使用者點開才看到控制
                // details.open = false;

                // <summary>ImageType 標題</summary>
                const summary = document.createElement("summary");
                summary.textContent = type;
                details.appendChild(summary);

                // <div class="group-body"> 控制區 </div>
                const body = document.createElement("div");
                body.className = "group-body";

                // --- 下拉 ---
                const select = document.createElement("select");
                select.style.width = "100%";
                select.style.marginBottom = "8px";

                const emptyOption = document.createElement("option");
                emptyOption.value = "";
                emptyOption.textContent = "請選擇圖層";
                select.appendChild(emptyOption);

                layers.forEach(layer => {
                    const option = document.createElement("option");
                    option.value = layer.Url;
                    option.textContent = layer.ImageName;
                    select.appendChild(option);
                });

                // --- 透明度 ---
                const opacityWrap = document.createElement("div");
                Object.assign(opacityWrap.style, {
                    display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px"
                });

                const opacityLabel = document.createElement("label");
                opacityLabel.textContent = "透明度：";

                const range = document.createElement("input");
                range.type = "range";
                range.min = "0"; range.max = "1"; range.step = "0.1"; range.value = "0.7";
                range.style.flex = "1";

                const valueSpan = document.createElement("span");
                valueSpan.textContent = "0.7";

                opacityWrap.appendChild(opacityLabel);
                opacityWrap.appendChild(range);
                opacityWrap.appendChild(valueSpan);

                // --- 清除 ---
                const clearBtn = document.createElement("button");
                clearBtn.textContent = "清除圖層";
                clearBtn.style.fontSize = "12px";

                // 組裝控制
                body.appendChild(select);
                body.appendChild(opacityWrap);
                body.appendChild(clearBtn);
                details.appendChild(body);
                container.appendChild(details);

                // 每個群組自己的目前圖層
                let currentGroupLayer = null;

                // 下拉切換
                select.addEventListener("change", function () {
                    if (currentGroupLayer) {
                        map.remove(currentGroupLayer);
                        currentGroupLayer = null;
                    }
                    if (!this.value) return;

                    currentGroupLayer = new WebTileLayer({
                        urlTemplate: `${this.value}/{z}/{y}/{x}`, // 若來源是 {x}/{y}，改此行
                        tileInfo,
                        spatialReference: { wkid: 102100 },
                        crossOrigin: "anonymous",
                        opacity: parseFloat(range.value) || 0.7
                    });
                    map.add(currentGroupLayer);
                });

                // 透明度即時套用
                range.addEventListener("input", function () {
                    const v = parseFloat(this.value) || 0.7;
                    valueSpan.textContent = v.toFixed(1);
                    if (currentGroupLayer) currentGroupLayer.opacity = v;
                });

                // 清除
                clearBtn.addEventListener("click", function () {
                    if (currentGroupLayer) {
                        map.remove(currentGroupLayer);
                        currentGroupLayer = null;
                    }
                    select.value = "";
                });
            });
        })
        .catch(err => console.error("❌ 圖層載入失敗：", err));
});
