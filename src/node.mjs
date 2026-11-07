import { Wasmer } from "@wasmer/sdk/node";
import { Session } from "./session.mjs";

export function openSession() {
  const createClient = () => new Wasmer();
  return Session.connect(createClient(), { createClient });
}
