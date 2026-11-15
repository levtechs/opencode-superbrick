import { spawn } from "node:child_process";

/** No shell interpolation. Bound output, timeout and cancellation for every helper. */
export function run(
  executable: string,
  args: string[],
  options: { signal?: AbortSignal; timeout?: number; maxBytes?: number; env?: NodeJS.ProcessEnv } = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: options.env ?? process.env,
      signal: options.signal,
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let size = 0;
    let failure: Error | undefined;
    const timer = setTimeout(() => {
      failure = new Error(`${executable} timed out`);
      child.kill("SIGKILL");
    }, options.timeout ?? 30_000);
    const collect = (chunks: Buffer[]) => (chunk: Buffer) => {
      size += chunk.length;
      if (size > (options.maxBytes ?? 16 * 1024 * 1024)) {
        failure = new Error(`${executable} returned too much output`);
        child.kill("SIGKILL");
      } else chunks.push(chunk);
    };
    child.stdout.on("data", collect(out));
    child.stderr.on("data", collect(err));
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (failure) return reject(failure);
      if (code !== 0) return reject(new Error(Buffer.concat(err).toString().trim() || `${executable} exited ${code}`));
      resolve(Buffer.concat(out).toString());
    });
  });
}
