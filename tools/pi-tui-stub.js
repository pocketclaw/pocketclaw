const noop = () => {};
const noopClass = class { constructor() {} };
export class Box extends noopClass {}
export class CombinedAutocompleteProvider extends noopClass {}
export class Container extends noopClass {}
export class Editor extends noopClass {}
export class Input extends noopClass {}
export class Key extends noopClass {}
export class Loader extends noopClass {}
export class Markdown extends noopClass {}
export class ProcessTerminal extends noopClass {}
export class SelectList extends noopClass {}
export class SettingsList extends noopClass {}
export class Spacer extends noopClass {}
export class TUI extends noopClass {}
export class Text extends noopClass {}
export function getEditorKeybindings() { return []; }
export function isKeyRelease() { return false; }
export function matchesKey() { return false; }
export function truncateToWidth(s) { return s; }
export default {};
