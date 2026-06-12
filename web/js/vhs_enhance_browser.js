// ComfyUI-VHS-Enhance — navegador de ficheros de servidor para los nodos de carga
// de vídeo por ruta (VHS_LoadVideoPath / VHS_LoadVideoFFmpegPath). Añade:
//   - una opción de MENÚ CONTEXTUAL (clic derecho) "📁 Browse for video…" (robusta:
//     VHS no la toca), y
//   - un botón "📁 Browse…" en el nodo (best-effort; se re-añade si VHS reconstruye
//     los widgets).
// Ambos abren un modal que navega carpetas del servidor (incl. rutas absolutas como
// /mnt/s3files/<proyecto>) reutilizando /vhs/getpath, y al elegir un vídeo rellenan
// el widget `video`.
import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";

const VIDEO_EXTS = "webm,mp4,mkv,gif,mov,avi,m4v,mpg,mpeg,wmv,flv,ts,m2ts";
const TARGET_NODES = ["VHS_LoadVideoPath", "VHS_LoadVideoFFmpegPath"];
const BTN_LABEL = "📁 Browse…";

function dirname(p) {
  if (!p) return "/";
  p = p.replace(/\\/g, "/").replace(/\/+$/, "");
  const i = p.lastIndexOf("/");
  return i > 0 ? p.slice(0, i) : "/";
}
function joinPath(a, b) {
  return (a.replace(/\/?$/, "/") + b).replace(/\/{2,}/g, "/");
}
async function listDir(path) {
  const q = new URLSearchParams({ path: path.replace(/\/?$/, "/"), extensions: VIDEO_EXTS });
  const r = await api.fetchApi("/vhs/getpath?" + q.toString());
  if (!r.ok) throw new Error("HTTP " + r.status);
  const j = await r.json();
  return Array.isArray(j) ? j : [];
}

function el(tag, style) {
  if (typeof tag !== "string") { style = tag; tag = "div"; }
  const n = document.createElement(tag);
  Object.assign(n.style, style || {});
  return n;
}
function btn(text, onclick) {
  const b = el("button", { background: "#2a2a30", color: "#eee", border: "1px solid #444",
    borderRadius: "6px", padding: "6px 9px", cursor: "pointer" });
  b.textContent = text; b.onclick = onclick; return b;
}

function openBrowser(startPath, onPick) {
  const ov = el("div", { position: "fixed", inset: "0", zIndex: "10010",
    background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center" });
  const box = el("div", { width: "min(620px,92vw)", maxHeight: "76vh", display: "flex",
    flexDirection: "column", background: "#1b1b1f", color: "#eee", border: "1px solid #444",
    borderRadius: "10px", fontFamily: "system-ui", fontSize: "13px", overflow: "hidden",
    boxShadow: "0 10px 40px rgba(0,0,0,.5)" });
  const pathInput = el("input", { flex: "1", background: "#111", color: "#eee",
    border: "1px solid #444", borderRadius: "6px", padding: "6px" });
  pathInput.addEventListener("keydown", (e) => { if (e.key === "Enter") nav(pathInput.value); });
  const head = el("div", { display: "flex", gap: "6px", alignItems: "center", padding: "10px", borderBottom: "1px solid #333" });
  head.append(btn("⬆", () => nav(dirname(cur))), pathInput, btn("Ir", () => nav(pathInput.value)), btn("✕", () => ov.remove()));
  const list = el("div", { overflowY: "auto", padding: "6px 10px" });
  box.append(head, list); ov.append(box);
  ov.addEventListener("click", (e) => { if (e.target === ov) ov.remove(); });
  document.body.append(ov);

  let cur = "/";
  function row(icon, name, onclick) {
    const d = el("div", { display: "flex", gap: "8px", padding: "5px 6px", borderRadius: "6px", cursor: "pointer", alignItems: "center" });
    d.onmouseenter = () => (d.style.background = "#2a2a30");
    d.onmouseleave = () => (d.style.background = "");
    const i = el("span", {}); i.textContent = icon;
    const n = el("span", { flex: "1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }); n.textContent = name;
    d.append(i, n); d.onclick = onclick; return d;
  }
  async function nav(path) {
    cur = (path || "/").replace(/\\/g, "/");
    pathInput.value = cur; list.textContent = "cargando…";
    let items;
    try { items = await listDir(cur); } catch (e) { list.textContent = "❌ " + e.message; return; }
    list.textContent = "";
    const dirs = items.filter((x) => x.endsWith("/")).sort();
    const files = items.filter((x) => !x.endsWith("/")).sort();
    if (!dirs.length && !files.length) { list.append(row("·", "(sin carpetas ni vídeos)", () => {})); return; }
    dirs.forEach((d) => list.append(row("📁", d.replace(/\/$/, ""), () => nav(joinPath(cur, d)))));
    files.forEach((f) => list.append(row("🎬", f, () => { onPick(joinPath(cur, f)); ov.remove(); })));
  }
  nav(startPath || "/");
}

function browseInto(node) {
  const vw = node.widgets?.find((x) => x.name === "video");
  openBrowser(vw && vw.value ? dirname(String(vw.value)) : "/", (picked) => {
    if (vw) {
      // VHS usa un widget combo (options.values) para el path: al fijar una ruta por
      // código hay que AÑADIRLA a options.values ANTES de value+callback, igual que
      // hace VHS internamente (drag-drop). Si no, el callback no la valida y no
      // previsualiza.
      if (vw.options && Array.isArray(vw.options.values) && !vw.options.values.includes(picked)) {
        vw.options.values.push(picked);
      }
      vw.value = picked;
      try { vw.callback?.(picked); } catch (e) {}
    }
    node.setDirtyCanvas(true, true);
  });
}

app.registerExtension({
  name: "VHS.Enhance.Browser",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (!TARGET_NODES.includes(nodeData?.name)) return;

    // 1) Menú contextual (robusto: VHS no reconstruye esto).
    const getOpts = nodeType.prototype.getExtraMenuOptions;
    nodeType.prototype.getExtraMenuOptions = function (canvas, options) {
      const r = getOpts ? getOpts.apply(this, arguments) : undefined;
      options.unshift({ content: "📁 Browse for video…", callback: () => browseInto(this) });
      return r;
    };

    // 2) Botón visible en el nodo (se re-añade si VHS rehace los widgets).
    const onCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const r = onCreated ? onCreated.apply(this, arguments) : undefined;
      const self = this;
      const add = () => {
        if (self.widgets?.some((w) => w.name === BTN_LABEL)) return;
        self.addWidget("button", BTN_LABEL, null, () => browseInto(self));
      };
      add();
      setTimeout(add, 0);
      setTimeout(add, 250);
      return r;
    };
  },
});
