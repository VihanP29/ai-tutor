import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export class StateStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.writeQueue = Promise.resolve();
  }

  async read() {
    const raw = await readFile(this.filePath, "utf8");
    return JSON.parse(raw);
  }

  async write(state) {
    const operation = async () => {
      await mkdir(path.dirname(this.filePath), { recursive: true });
      const tempPath = `${this.filePath}.${process.pid}.tmp`;
      const nextState = { ...state, updatedAt: new Date().toISOString() };
      await writeFile(tempPath, `${JSON.stringify(nextState, null, 2)}\n`, "utf8");
      await rename(tempPath, this.filePath);
      return nextState;
    };

    this.writeQueue = this.writeQueue.then(operation, operation);
    return this.writeQueue;
  }

  async update(updater) {
    const operation = async () => {
      const current = await this.read();
      const next = await updater(structuredClone(current));
      await mkdir(path.dirname(this.filePath), { recursive: true });
      const tempPath = `${this.filePath}.${process.pid}.tmp`;
      const stamped = { ...next, updatedAt: new Date().toISOString() };
      await writeFile(tempPath, `${JSON.stringify(stamped, null, 2)}\n`, "utf8");
      await rename(tempPath, this.filePath);
      return stamped;
    };

    this.writeQueue = this.writeQueue.then(operation, operation);
    return this.writeQueue;
  }
}
