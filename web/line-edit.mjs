// Local line editor for the terminal. Up and down walk earlier commands.
// Left and right move through the current line; Ctrl jumps a word at a time.

export function wordLeft(text, index) {
  let cursor = index;
  while (cursor > 0 && text[cursor - 1] === " ") cursor -= 1;
  while (cursor > 0 && text[cursor - 1] !== " ") cursor -= 1;
  return cursor;
}

export function wordRight(text, index) {
  let cursor = index;
  while (cursor < text.length && text[cursor] !== " ") cursor += 1;
  while (cursor < text.length && text[cursor] === " ") cursor += 1;
  return cursor;
}

export function takeKeys(buffer) {
  const keys = [];
  let index = 0;
  while (index < buffer.length) {
    if (buffer[index] !== "\x1b") {
      keys.push(buffer[index]);
      index += 1;
      continue;
    }
    const slice = buffer.slice(index);
    const match = /^(?:\x1b\[[0-9;]*[@A-Za-z~]|\x1bO[A-DHF])/.exec(slice);
    if (match) {
      keys.push(match[0]);
      index += match[0].length;
      continue;
    }
    if (/^\x1b(?:\[[0-9;]*)?$/.test(slice) || /^\x1bO$/.test(slice)) return { keys, rest: slice };
    index += 1;
  }
  return { keys, rest: "" };
}

export function createEditor() {
  let line = "";
  let cursor = 0;
  const history = [];
  let historyAt = 0;
  let draft = "";

  const place = (next) => {
    cursor = Math.max(0, Math.min(line.length, next));
  };

  const recall = (next) => {
    if (next < 0 || next > history.length) return "ignore";
    if (historyAt === history.length) draft = line;
    historyAt = next;
    line = historyAt === history.length ? draft : history[historyAt];
    cursor = line.length;
    return "redraw";
  };

  return {
    get line() {
      return line;
    },
    get cursor() {
      return cursor;
    },
    get history() {
      return history.slice();
    },
    clear() {
      line = "";
      cursor = 0;
      draft = "";
      historyAt = history.length;
    },
    type(text) {
      if (!text) return "ignore";
      line = line.slice(0, cursor) + text + line.slice(cursor);
      cursor += text.length;
      if (historyAt === history.length) draft = line;
      return "redraw";
    },
    replace(text) {
      line = text;
      cursor = line.length;
      if (historyAt === history.length) draft = line;
      return "redraw";
    },
    insert(text) {
      if (!text) return "ignore";
      const gap = cursor > 0 && line[cursor - 1] !== " " && !text.startsWith(" ") ? " " : "";
      return this.type(`${gap}${text}`);
    },
    submit() {
      const command = line;
      if (command.trim()) history.push(command);
      line = "";
      cursor = 0;
      draft = "";
      historyAt = history.length;
      return command;
    },
    press(key) {
      if (key === "\r" || key === "\n") return "submit";
      if (key === "\u0003") return "cancel";
      if (key === "\u007f") {
        if (cursor === 0) return "ignore";
        line = line.slice(0, cursor - 1) + line.slice(cursor);
        cursor -= 1;
        if (historyAt === history.length) draft = line;
        return "redraw";
      }
      if (key === "\b") {
        const next = wordLeft(line, cursor);
        if (next === cursor) return "ignore";
        line = line.slice(0, next) + line.slice(cursor);
        cursor = next;
        if (historyAt === history.length) draft = line;
        return "redraw";
      }
      if (key >= " ") {
        line = line.slice(0, cursor) + key + line.slice(cursor);
        cursor += key.length;
        if (historyAt === history.length) draft = line;
        return "redraw";
      }
      const csi = /^\x1b\[([0-9;]*)([A-Za-z~])$/.exec(key);
      const ss3 = /^\x1bO([A-DHF])$/.exec(key);
      if (!csi && !ss3) return "ignore";
      const args = csi?.[1] ?? "";
      const final = csi?.[2] ?? ss3[1];
      const parts = args.split(";").filter(Boolean);
      const mod = parts.length > 1 ? Number(parts[1]) : 1;
      const word = ((mod - 1) & 4) !== 0;
      const move = (next) => {
        const before = cursor;
        place(next);
        return cursor === before ? "ignore" : "redraw";
      };
      if (final === "D") return move(word ? wordLeft(line, cursor) : cursor - 1);
      if (final === "C") return move(word ? wordRight(line, cursor) : cursor + 1);
      if (final === "A" && !word) return recall(historyAt - 1);
      if (final === "B" && !word) return recall(historyAt + 1);
      if (final === "H" || (final === "~" && (parts[0] === "1" || parts[0] === "7"))) return move(0);
      if (final === "F" || (final === "~" && (parts[0] === "4" || parts[0] === "8"))) return move(line.length);
      if (final === "~" && parts[0] === "3") {
        if (cursor >= line.length) return "ignore";
        line = line.slice(0, cursor) + line.slice(cursor + 1);
        if (historyAt === history.length) draft = line;
        return "redraw";
      }
      return "ignore";
    },
  };
}
