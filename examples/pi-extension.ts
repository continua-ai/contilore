import { createLocalLearningLoop, createPiTraceExtension } from "../src/index.js";

const loop = createLocalLearningLoop({
  dataDir: ".continua-loop",
});

export default createPiTraceExtension({
  loop,
  scope: "personal",
  maxSuggestions: 3,
});
