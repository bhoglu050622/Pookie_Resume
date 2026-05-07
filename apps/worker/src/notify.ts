import notifier from "node-notifier";
import { log } from "./log.js";

export function notify(title: string, message: string) {
  try {
    notifier.notify({ title: `Pookie · ${title}`, message, sound: true });
  } catch (e) {
    log.warn({ err: e }, "notify failed");
  }
}
