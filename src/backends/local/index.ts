import { join } from "node:path";
import { LearningLoop } from "../../core/learningLoop.js";
import { SimpleWrongTurnMiner } from "../../core/miner.js";
import {
  type ProjectIdentityOverrides,
  resolveProjectIdentity,
} from "../../core/projectIdentity.js";
import { FileTraceStore } from "./fileTraceStore.js";
import { InMemoryLexicalIndex } from "./lexicalIndex.js";

export interface LocalLoopOptions {
  dataDir?: string;
  projectIdentity?: ProjectIdentityOverrides;
}

export function createLocalLearningLoop(options: LocalLoopOptions = {}): LearningLoop {
  const projectIdentity = resolveProjectIdentity(options.projectIdentity);
  const dataDir =
    options.dataDir ?? join(process.cwd(), projectIdentity.defaultDataDirName);

  return new LearningLoop({
    store: new FileTraceStore(dataDir),
    index: new InMemoryLexicalIndex(),
    miner: new SimpleWrongTurnMiner(),
  });
}

export { FileTraceStore };
export { InMemoryLexicalIndex };
