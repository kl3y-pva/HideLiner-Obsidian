declare module "obsidian" {
  export class Plugin {
    app: any;
    addCommand(command: any): void;
    addRibbonIcon(icon: string, title: string, callback: () => void): RibbonIcon;
    registerMarkdownPostProcessor(callback: (el: HTMLElement) => void): void;
    onload(): void;
    unload(): void;
  }

  export class Notice {
    constructor(message: string);
  }

  export interface RibbonIcon {
    setIcon(icon: string): void;
  }
}