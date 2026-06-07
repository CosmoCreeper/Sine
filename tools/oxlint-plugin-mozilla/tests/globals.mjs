/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

import assert from "assert";
import globalsUtils from "../lib/globals.mjs";
import path from "path";
import fs from "fs";

var { getGlobalsForCode } = globalsUtils;

/* global describe, it, beforeEach, afterEach */

describe("global variables", function () {
  it("should reflect top-level this property assignment", function () {
    const globals = getGlobalsForCode(`
this.foo = 10;
`);
    assert.deepEqual(globals, [{ name: "foo", writable: true }]);
  });

  it("should reflect this property assignment inside block", function () {
    const globals = getGlobalsForCode(`
{
  this.foo = 10;
}
`);
    assert.deepEqual(globals, [{ name: "foo", writable: true }]);
  });

  it("should ignore this property assignment inside function declaration", function () {
    const globals = getGlobalsForCode(`
function f() {
  this.foo = 10;
}
`);
    assert.deepEqual(globals, [{ name: "f", writable: true }]);
  });

  it("should ignore this property assignment inside function expression", function () {
    const globals = getGlobalsForCode(`
(function f() {
  this.foo = 10;
});
`);
    assert.deepEqual(globals, []);
  });

  it("should ignore this property assignment inside method", function () {
    const globals = getGlobalsForCode(`
({
  method() {
    this.foo = 10;
  }
});
`);
    assert.deepEqual(globals, []);
  });

  it("should ignore this property assignment inside accessor", function () {
    const globals = getGlobalsForCode(`
({
  get x() {
    this.foo = 10;
  },
  set x(v) {
    this.bar = 10;
  }
});
`);
    assert.deepEqual(globals, []);
  });

  it("should reflect this property assignment inside arrow function", function () {
    const globals = getGlobalsForCode(`
() => {
  this.foo = 10;
};
`);
    assert.deepEqual(globals, [{ name: "foo", writable: true }]);
  });

  it("should ignore this property assignment inside arrow function inside function expression", function () {
    const globals = getGlobalsForCode(`
(function f() {
  () => {
    this.foo = 10;
  };
});
`);
    assert.deepEqual(globals, []);
  });

  it("should ignore this property assignment inside class static", function () {
    const globals = getGlobalsForCode(`
class A {
  static {
    this.foo = 10;
    (() => {
      this.bar = 10;
    })();
  }
}
`);
    assert.deepEqual(globals, [{ name: "A", writable: true }]);
  });

  it("should ignore this property assignment inside class property", function () {
    const globals = getGlobalsForCode(`
class A {
  a = this.foo = 10;
  b = (() => {
    this.bar = 10;
  })();
}
`);
    assert.deepEqual(globals, [{ name: "A", writable: true }]);
  });

  it("should ignore this property assignment inside class static property", function () {
    const globals = getGlobalsForCode(`
class A {
  static a = this.foo = 10;
  static b = (() => {
    this.bar = 10;
  })();
}
`);
    assert.deepEqual(globals, [{ name: "A", writable: true }]);
  });

  it("should ignore this property assignment inside class private property", function () {
    const globals = getGlobalsForCode(`
class A {
  #a = this.foo = 10;
  #b = (() => {
    this.bar = 10;
  })();
}
`);
    assert.deepEqual(globals, [{ name: "A", writable: true }]);
  });

  it("should ignore this property assignment inside class static private property", function () {
    const globals = getGlobalsForCode(`
class A {
  static #a = this.foo = 10;
  static #b = (() => {
    this.bar = 10;
  })();
}
`);
    assert.deepEqual(globals, [{ name: "A", writable: true }]);
  });

  it("should reflect lazy getters", function () {
    const globals = getGlobalsForCode(`
ChromeUtils.defineESModuleGetters(this, {
  A: "B",
});
`);
    assert.deepEqual(globals, [{ name: "A", writable: true, explicit: true }]);
  });
});

function getFullTestFilePath(filename) {
  return import.meta.dirname + "/globals-data/" + filename;
}

describe("global import - file trees", () => {
  function callFn(filename) {
    return globalsUtils.ensureFileTree({
      filePath: getFullTestFilePath(filename),
    });
  }

  function stripPathsSet(set) {
    return new Set(set.values().map((v) => path.basename(v)));
  }

  function stripPathsMap(map) {
    return new Map(map.entries().map(([k, v]) => [path.basename(k), stripPathsSet(v)]));
  }

  beforeEach(() => {
    globalsUtils.clearFileImportGraph();
  });

  it("should report errors where import-globals-from tries to import mjs files", () => {
    assert.throws(
      () => {
        callFn("import-globals-from-invalid.js");
      },
      {
        message: "import-globals-from does not support module files - use a direct import instead",
      }
    );
  });

  function assertImportGraph(testFilename, expectedMap, expectedSet) {
    let fileImportGraph = callFn(testFilename);

    assert.deepEqual(stripPathsMap(fileImportGraph), expectedMap);
    assert.deepEqual(
      stripPathsSet(fileImportGraph.getSubGraph(getFullTestFilePath(testFilename))),
      expectedSet
    );
  }

  it("should build a tree when importing globals from another file", () => {
    assertImportGraph(
      "import-globals-from-1.js",
      new Map([
        ["import-globals-from-1-additional.js", new Set()],
        ["import-globals-from-1.js", new Set(["import-globals-from-1-additional.js"])],
      ]),
      new Set(["import-globals-from-1-additional.js", "import-globals-from-1.js"])
    );
  });

  it("should handle loadSubScript", () => {
    assertImportGraph(
      "loadSubScript-1.js",
      new Map([
        ["loadSubScript-1.js", new Set(["loadSubScript-1-additional.js"])],
        ["loadSubScript-1-additional.js", new Set([])],
      ]),
      new Set(["loadSubScript-1-additional.js", "loadSubScript-1.js"])
    );
  });

  it("should handle importScripts in a worker", () => {
    assertImportGraph(
      "importScripts-1.js",
      new Map([
        ["importScripts-1.js", new Set(["importScripts-1-additional.js"])],
        ["importScripts-1-additional.js", new Set([])],
      ]),
      new Set(["importScripts-1-additional.js", "importScripts-1.js"])
    );
  });

  it("should build a tree handling a simple circular import", () => {
    assertImportGraph(
      "import-globals-from-circular-1.js",
      new Map([
        ["import-globals-from-circular-1.js", new Set(["import-globals-from-circular-2.js"])],
        ["import-globals-from-circular-2.js", new Set(["import-globals-from-circular-1.js"])],
      ]),
      new Set(["import-globals-from-circular-2.js", "import-globals-from-circular-1.js"])
    );
  });

  it("should build a tree handling complex circular import", () => {
    assertImportGraph(
      "import-globals-from-circular-3.js",
      new Map([
        ["import-globals-from-circular-3.js", new Set(["import-globals-from-circular-4.js"])],
        ["import-globals-from-circular-4.js", new Set(["import-globals-from-circular-5.js"])],
        ["import-globals-from-circular-5.js", new Set(["import-globals-from-circular-3.js"])],
      ]),
      new Set([
        "import-globals-from-circular-3.js",
        "import-globals-from-circular-4.js",
        "import-globals-from-circular-5.js",
      ])
    );
  });
});

describe("mtime invalidation", () => {
  let tempFiles = [];

  function writeTempFile(filename, content) {
    let filePath = getFullTestFilePath(filename);
    fs.writeFileSync(filePath, content, "utf8");
    tempFiles.push(filePath);
    return filePath;
  }

  beforeEach(() => {
    globalsUtils.clearFileImportGraph();
    tempFiles = [];
  });

  afterEach(() => {
    for (let filePath of tempFiles) {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  });

  it("should re-parse globals when a file's mtime changes", async () => {
    let filePath = writeTempFile("mtime-test-a.js", "var x = 1;");

    let globals = globalsUtils.getGlobalsForFile({ filePath });
    assert.deepEqual(globals, [{ name: "x", writable: true }]);

    // Wait to ensure a different mtime.
    await new Promise((resolve) => setTimeout(resolve, 10));
    fs.writeFileSync(filePath, "var y = 1;", "utf8");

    globals = globalsUtils.getGlobalsForFile({ filePath });
    assert.deepEqual(globals, [{ name: "y", writable: true }]);
  });
});

describe("global import - correct globals", () => {
  beforeEach(() => {
    globalsUtils.clearFileImportGraph();
  });

  function callFn(filename) {
    return globalsUtils.getGlobalsForFile({
      filePath: getFullTestFilePath(filename),
    });
  }

  it("should return the globals for the simple import case", () => {
    let globals = callFn("import-globals-from-1.js");

    assert.deepEqual(globals, [
      { name: "foo1", writable: true },
      { explicit: true, name: "foo", writable: true },
      { name: "bar1", writable: true },
      { explicit: true, name: "bar", writable: true },
    ]);
  });

  it("should return the globals for a simple circular import case", () => {
    let globals = callFn("import-globals-from-circular-1.js");

    assert.deepEqual(
      globals,
      [
        { name: "circ1", writable: true },
        { name: "circ2", writable: true },
      ],
      "should return the correct global when getting the globals for the first file"
    );

    globals = callFn("import-globals-from-circular-2.js");

    assert.deepEqual(
      globals,
      [
        { name: "circ2", writable: true },
        { name: "circ1", writable: true },
      ],
      "should return the correct global when getting the globals for the second file"
    );
  });

  it("should return the globals for a simple circular import case", () => {
    let globals = callFn("import-globals-from-circular-3.js");

    assert.deepEqual(
      globals,
      [
        { name: "circ3", writable: true },
        { name: "circ4", writable: true },
        { name: "circ5", writable: true },
      ],
      "should return the correct global when getting the globals for the first file"
    );

    globals = callFn("import-globals-from-circular-4.js");

    assert.deepEqual(
      globals,
      [
        { name: "circ4", writable: true },
        { name: "circ5", writable: true },
        { name: "circ3", writable: true },
      ],
      "should return the correct global when getting the globals for the second file"
    );

    globals = callFn("import-globals-from-circular-5.js");

    assert.deepEqual(
      globals,
      [
        { name: "circ5", writable: true },
        { name: "circ3", writable: true },
        { name: "circ4", writable: true },
      ],
      "should return the correct global when getting the globals for the third file"
    );
  });
});
