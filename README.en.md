# HideLiner (Obsidian Plugin)

An Obsidian plugin that hides text wrapped in `&&...&&` and toggles display mode with a single command.

## What the plugin does

- Finds fragments like `&&secret text&&`.
- In `Hidden Mode: ON`, masks content (characters are replaced with `▓`).
- In `Hidden Mode: OFF`, shows the original text.
- Works in preview/live preview (within the current implementation).

## Syntax example

```md
Regular text.
&&This will be hidden in Hidden Mode&&
Regular text again.
```

### Hidden mode

![Hidden text mode](assets4git/hiden_text.png)

### Visible mode

![Visible text mode](assets4git/open_text.png)

## Installation (manual)

1. Clone the repository.
2. Copy plugin files to the Obsidian folder:
   `.obsidian/plugins/hidden-text-toggle/`
3. In Obsidian, open `Settings -> Community plugins` and enable the plugin.

## Command

- `Toggle Hidden Mode` - toggles hidden/visible mode.
