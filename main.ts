import { Plugin, Notice } from "obsidian";

export default class HiddenTextToggle extends Plugin {
  private hiddenMode = false;

  onload() {
    console.log("HiddenTextToggle загружен");

    // Команда для Command Palette
    this.addCommand({
      id: "toggle-hidden-mode",
      name: "Toggle Hidden Mode",
      callback: () => this.toggleHiddenMode(),
    });

    // Кнопка в левую панель (один значок)
    this.addRibbonIcon("eye", "Toggle Hidden Mode", () => this.toggleHiddenMode());

    // Markdown постпроцессор
    this.registerMarkdownPostProcessor((el: HTMLElement) => {
      if (this.hiddenMode) {
        el.innerHTML = el.innerHTML.replace(/&&([\s\S]+?)&&/g, (_, p1) =>
          p1.replace(/[^\s]/g, "▓") // пробелы остаются
        );
      }
    });
  }

  toggleHiddenMode() {
    this.hiddenMode = !this.hiddenMode;

    // Перерендер всех панелей (включая Live Preview)
    this.app.workspace.iterateAllLeaves((leaf: any) => {
      if (leaf.view && leaf.view.renderMarkdown) {
        leaf.view.renderMarkdown(leaf.view.getViewData(), leaf.view.containerEl);
      }
    });

    new Notice("Hidden Mode: " + (this.hiddenMode ? "ON" : "OFF"));
  }
}