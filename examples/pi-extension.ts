import { createLocalLearningLoop, createPiTraceExtension } from "../src/index.js";

const loop = createLocalLearningLoop({
  dataDir: ".happy-paths",
});

export default createPiTraceExtension({
  loop,
  scope: "personal",
  maxSuggestions: 3,
});
