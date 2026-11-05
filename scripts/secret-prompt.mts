import { emitKeypressEvents } from "node:readline";
export async function secretPrompt(label: string): Promise<string> {
  const input = process.stdin,
    output = process.stdout;
  if (!input.isTTY || typeof input.setRawMode !== "function")
    throw Error(
      "Run this command in a private interactive terminal. Redirected password input is not accepted.",
    );
  emitKeypressEvents(input);
  const wasRaw = input.isRaw;
  input.setRawMode(true);
  input.resume();
  output.write(label);
  return new Promise((resolve, reject) => {
    let value = "";
    function finish(error?: Error) {
      input.removeListener("keypress", handle);
      input.setRawMode(wasRaw);
      input.pause();
      output.write("\n");
      if (error) reject(error);
      else resolve(value);
    }
    function handle(
      text: string,
      key: { ctrl?: boolean; meta?: boolean; name?: string },
    ) {
      if (key.ctrl && key.name === "c") {
        finish(Error("Cancelled. No change was applied."));
        return;
      }
      if (key.name === "return" || key.name === "enter") {
        finish();
        return;
      }
      if (key.name === "backspace") {
        if (value) {
          value = Array.from(value).slice(0, -1).join("");
          output.write("\b \b");
        }
        return;
      }
      if (
        text &&
        !key.ctrl &&
        !key.meta &&
        !/[\x00-\x1f\x7f]/.test(text) &&
        value.length + text.length <= 512
      ) {
        value += text;
        output.write("*".repeat(Array.from(text).length));
      }
    }
    input.on("keypress", handle);
  });
}
