/** A file of an uploaded archive, `path` relative to the archive's root. */
interface FileEntry {
  path: string;
  size: number;
}

/** A dir path without `./`, trailing slashes, or `.` for the root. */
export const trimDir = (dir: string): string => dir.replace(/^\.\//, "").replace(/\/+$/, "").replace(/^\.$/, "");

/** The files under `dir` (with its trailing `/`; `""` for all of them), paths relative to it. */
export const filesUnder = <T extends FileEntry>(files: T[], dir: string): T[] =>
  files.filter((file) => file.path.startsWith(dir)).map((file) => ({ ...file, path: file.path.slice(dir.length) }));
