import { join } from "node:path";
import { LearningLoop } from "../../core/learningLoop.js";
import { SimpleWrongTurnMiner } from "../../core/miner.js";
import { FileTraceStore } from "./fileTraceStore.js";
import { InMemoryLexicalIndex } from "./lexicalIndex.js";

export interface LocalLoopOptions {
  dataDir?: string;
}

export function createLocalLearningLoop(options: LocalLoopOptions = {}): LearningLoop {
  const dataDir = options.dataDir ?? join(process.cwd(), ".continua-loop");

  return new LearningLoop({
    store: new FileTraceStore(dataDir),
    index: new InMemoryLexicalIndex(),
    miner: new SimpleWrongTurnMiner(),
  });
}

export { FileTraceStore };
export { InMemoryLexicalIndex };
