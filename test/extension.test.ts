import assert from "node:assert/strict";
import test from "node:test";
import extension from "../extensions/pi-goal.js";

function makeHarness() {
  const handlers = new Map<string, (event: any, ctx: any) => unknown>();
  const commands = new Map<string, any>();
  const tools = new Map<string, any>();
  const entries: any[] = [];
  const pi: any = {
    on(name: string, handler: any) {
      handlers.set(name, handler);
    },
    registerCommand(name: string, definition: any) {
      commands.set(name, definition);
    },
    registerTool(definition: any) {
      tools.set(definition.name, definition);
    },
    appendEntry(type: string, data: unknown) {
      entries.push({ type: "custom", customType: type, data });
    },
    sendUserMessage() {},
  };
  const ctx: any = {
    hasUI: false,
    mode: "print",
    model: undefined,
    ui: { notify() {}, setStatus() {}, setWidget() {} },
    sessionManager: {
      getBranch: () => entries,
      getLeafEntry: () => undefined,
    },
    isIdle: () => true,
  };
  extension(pi);
  return { handlers, commands, tools, entries, ctx };
}

test("creates, rejects replacement, and clears goals through the model tool and command", async () => {
  const harness = makeHarness();
  const created = await harness.tools
    .get("create_goal")
    .execute("id", { objective: "ship it" }, undefined, undefined, harness.ctx);
  assert.match(created.content[0].text, /Goal created/);
  const rejected = await harness.tools
    .get("create_goal")
    .execute("id", { objective: "replace it" }, undefined, undefined, harness.ctx);
  assert.match(rejected.content[0].text, /unfinished goal/);
  await harness.commands.get("goal").handler("clear", harness.ctx);
  assert.equal(harness.entries.at(-1).data.cleared, true);
});
