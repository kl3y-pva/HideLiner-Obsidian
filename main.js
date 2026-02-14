"use strict";
const { Plugin, Notice } = require("obsidian");
let viewMod = null;
let stateMod = null;
let EditorView, Decoration, ViewPlugin, ViewUpdate, MatchDecorator;
let RangeSetBuilder, Compartment;
function tryLoadCM() {
  try {
    if (typeof require === "function") {
      viewMod = require("@codemirror/view");
      stateMod = require("@codemirror/state");
    }
  } catch (_) {
    viewMod = null;
    stateMod = null;
  }
  if (viewMod && stateMod) {
    ({ EditorView, Decoration, ViewPlugin, ViewUpdate, MatchDecorator } = viewMod);
    ({ RangeSetBuilder, Compartment } = stateMod);
    return true;
  }
  return false;
}

// Replace every non-whitespace char with ▓, keep spaces and newlines intact
function maskPreservingSpaces(s) {
  return s.replace(/[^\s]/g, "▓");
}

// Replace all &&...&& matches inside a single text node with masked spans
function replaceRangesInTextNode(node, regex, masker) {
  const text = node.nodeValue || "";
  let match;
  let lastIndex = 0;
  regex.lastIndex = 0;
  const frag = document.createDocumentFragment();

  while ((match = regex.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    const before = text.slice(lastIndex, start);
    if (before) frag.appendChild(document.createTextNode(before));

    const span = document.createElement("span");
    span.className = "htt-masked";
    span.textContent = masker(match[1]); // mask inner, drop markers
    frag.appendChild(span);

    lastIndex = end;
  }

  const after = text.slice(lastIndex);
  if (after) frag.appendChild(document.createTextNode(after));

  node.replaceWith(frag);
}

// Build a CM6 extension that either masks content or highlights the markers like markdown
function makeHttExtension(hiddenMode) {
  // Local WidgetType to avoid referencing viewMod when CM isn't available
  class MaskWidget extends viewMod.WidgetType {
    constructor(text) { super(); this.text = text; }
    toDOM() {
      const span = document.createElement("span");
      span.className = "htt-masked cm-htt-masked";
      span.textContent = this.text;
      return span;
    }
    eq(other) { return other.text === this.text; }
    ignoreEvent() { return false; }
  }

  const regex = /&&([\s\S]+?)&&/g;

  class HttViewPlugin {
    constructor(view) {
      this.view = view;
      this.decorations = this.buildDecos(hiddenMode);
    }
    update(update) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = this.buildDecos(hiddenMode);
      }
    }
    buildDecos(hidden) {
      const builder = new RangeSetBuilder();
      const doc = this.view.state.doc;

      for (const { from, to } of this.view.visibleRanges) {
        const text = doc.sliceString(from, to);
        regex.lastIndex = 0;
        let m;
        while ((m = regex.exec(text)) !== null) {
          const mFrom = from + m.index;
          const mTo = mFrom + m[0].length;

          if (hidden) {
            const masked = maskPreservingSpaces(m[1]);
            // Insert the widget FIRST with side:-1 so its startSide < replace's startSide
            builder.add(mFrom, mFrom, Decoration.widget({ widget: new MaskWidget(masked), side: -1 }));
            // Then replace the whole &&...&& range so the original text is hidden
            builder.add(mFrom, mTo, Decoration.replace({ inclusive: false }));
          } else {
            // Add in strictly increasing `from` order to satisfy RangeSetBuilder
            builder.add(mFrom, mFrom + 2, Decoration.mark({ class: "cm-htt-marker" }));          // leading &&
            builder.add(mFrom + 2, mTo - 2, Decoration.mark({ class: "cm-htt-inner" }));          // inner
            builder.add(mTo - 2, mTo, Decoration.mark({ class: "cm-htt-marker" }));               // trailing &&
          }
        }
      }

      return builder.finish();
    }
  }

  return ViewPlugin.fromClass(HttViewPlugin, {
    decorations: v => v.decorations
  });
}

class HiddenTextToggle extends Plugin {
  constructor() {
    super(...arguments);
    this.hiddenMode = true;
    // && ... && (non-greedy), supports newlines
    this.pattern = /&&([\s\S]+?)&&/g;
    // Do not process inside these tags
    this.ignoredTags = new Set(["CODE", "PRE", "KBD", "SAMP"]);
    this.cmCompartment = null;
    this.cmAvailable = false;
  }

  onload() {
    console.log("HiddenTextToggle loaded");

    // Command Palette action
    this.addCommand({
      id: "toggle-hidden-mode",
      name: "Toggle Hidden Mode",
      callback: () => this.toggleHiddenMode(),
    });

    // Single ribbon icon (no dynamic switching)
    this.addRibbonIcon("eye", "Toggle Hidden Mode", () => this.toggleHiddenMode());

    // Inject minimal CSS for editor/preview styling
    const styleEl = document.createElement("style");
    styleEl.id = "htt-inline-styles";
    styleEl.textContent = `
  /* Preview & Editor masked widgets: neutral gray instead of yellow */
  .markdown-preview-view .htt-masked,
  .cm-htt-masked {
    background: var(--background-modifier-hover);
    border-radius: 2px;
    padding: 0 1px;
  }
  /* Editor: markers dim, inner highlighted in neutral gray (not yellow) */
  .cm-htt-marker { opacity: 0.5; color: var(--text-muted); }
  .cm-htt-inner { background: var(--background-modifier-hover); border-radius: 2px; padding: 0 1px; }
  `;
    document.head.appendChild(styleEl);
    this.register(() => { styleEl.remove(); });

    // Try to load CodeMirror modules (desktop). On mobile (iOS/Android) this can fail.
    this.cmAvailable = tryLoadCM();

    // Register CodeMirror extension via Compartment so we can reconfigure on toggle
    if (this.cmAvailable) {
      this.cmCompartment = new Compartment();
      const initialExt = makeHttExtension(this.hiddenMode);
      this.registerEditorExtension(this.cmCompartment.of(initialExt));
    } else {
      console.log("HiddenTextToggle: CodeMirror not available (likely mobile). Editor masking disabled; preview masking still active.");
    }

    // Preview renderer (safe DOM walk, no innerHTML replace)
    this.registerMarkdownPostProcessor((el) => {
      if (!this.hiddenMode) return;
      this.processElement(el);
    });
  }

  // Walk DOM and replace text inside &&...&& (skip code/pre/etc.)
  processElement(rootEl) {
    const traverse = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        // Quick check: only touch nodes that actually contain our markers
        if (!this.pattern.test(node.nodeValue || "")) return;
        // reset lastIndex because .test() advanced it
        this.pattern.lastIndex = 0;
        replaceRangesInTextNode(node, this.pattern, maskPreservingSpaces);
        return;
      }
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = /** @type {HTMLElement} */ (node);
        if (this.ignoredTags.has(el.tagName)) return;
        for (let i = 0; i < el.childNodes.length; i++) {
          traverse(el.childNodes[i]);
        }
      }
    };

    traverse(rootEl);
  }

  reconfigureEditors() {
    if (!this.cmAvailable || !this.cmCompartment) return;
    const newExt = makeHttExtension(this.hiddenMode);
    const effect = this.cmCompartment.reconfigure(newExt);
    this.app.workspace.iterateAllLeaves((leaf) => {
      const view = leaf.view;
      if (view && view.editor && view.editor.cm) {
        view.editor.cm.dispatch({ effects: effect });
      }
    });
  }

  toggleHiddenMode() {
    this.hiddenMode = !this.hiddenMode;
    new Notice(`Hidden Mode: ${this.hiddenMode ? "ON" : "OFF"}`);

    // Reconfigure editor decorations for Live Preview
    this.reconfigureEditors();

    // Force re-render of all markdown views (reading/preview panes)
    this.app.workspace.iterateAllLeaves((leaf) => {
      const view = leaf.view;
      if (!view) return;
      if (typeof view.getViewData === "function" && typeof view.renderMarkdown === "function") {
        view.renderMarkdown(view.getViewData(), view.containerEl);
        return;
      }
      if (view.previewMode && typeof view.previewMode.rerender === "function") {
        view.previewMode.rerender(true);
      }
    });

    // Fallback: broadcast a layout change
    this.app.workspace.trigger("layout-change");
  }
}

exports.default = HiddenTextToggle;
