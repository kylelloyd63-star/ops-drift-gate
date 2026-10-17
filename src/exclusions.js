const TEST_DIRECTORIES = new Set(["test", "tests", "__tests__", "fixtures"]);

export function isTestDirectoryName(name) {
  return TEST_DIRECTORIES.has(name);
}

// *.test.* files, anywhere in the tree. The leading star may be empty.
export function isTestFileName(name) {
  return /(?:^|\/)[^/]*\.test\.[^/]+$/.test(name);
}
