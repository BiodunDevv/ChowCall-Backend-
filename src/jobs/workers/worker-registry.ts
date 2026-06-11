import { queues } from "../queues/queue-registry.js";

export function registerWorkers() {
  return {
    registered: Object.values(queues),
    mode: "scaffold",
  };
}
