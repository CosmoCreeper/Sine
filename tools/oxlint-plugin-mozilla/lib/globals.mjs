/**
 * @file functions for scanning code for globals, and imported globals.
 * When scanning files, `FileImportASTHandler` is used to build a tree of the
 * imports. The tree is then used as an iteration point, and `GlobalsForNode`
 * is used to build the list of globals for each individual file.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import path from "path";
import fs from "fs";
import helpers from "./helpers.mjs";
import * as htmlparser from "htmlparser2";
import testharnessEnvironment from "./environments/testharness.mjs";

function getFileMtime(filePath) {
  return fs.statSync(filePath).mtimeMs;
}

const callExpressionDefinitions = [
  /^loader\.lazyGetter\((?:globalThis|this), "(\w+)"/,
  /^loader\.lazyServiceGetter\((?:globalThis|this), "(\w+)"/,
  /^loader\.lazyRequireGetter\((?:globalThis|this), "(\w+)"/,
  /^ChromeUtils\.defineLazyGetter\((?:globalThis|this), "(\w+)"/,
  /^XPCOMUtils\.defineLazyPreferenceGetter\((?:globalThis|this), "(\w+)"/,
  /^XPCOMUtils\.defineLazyScriptGetter\((?:globalThis|this), "(\w+)"/,
  /^XPCOMUtils\.defineLazyServiceGetter\((?:globalThis|this), "(\w+)"/,
  /^XPCOMUtils\.defineConstant\((?:globalThis|this), "(\w+)"/,
  /^DevToolsUtils\.defineLazyGetter\((?:globalThis|this), "(\w+)"/,
  /^Object\.defineProperty\((?:globalThis|this), "(\w+)"/,
  /^Reflect\.defineProperty\((?:globalThis|this), "(\w+)"/,
  /^this\.__defineGetter__\("(\w+)"/,
];

const callExpressionMultiDefinitions = [
  "XPCOMUtils.defineLazyGlobalGetters(this,",
  "XPCOMUtils.defineLazyGlobalGetters(globalThis,",
  "XPCOMUtils.defineLazyServiceGetters(this,",
  "XPCOMUtils.defineLazyServiceGetters(globalThis,",
  "ChromeUtils.defineESModuleGetters(this,",
  "ChromeUtils.defineESModuleGetters(globalThis,",
  "loader.lazyRequireGetter(this,",
  "loader.lazyRequireGetter(globalThis,",
];

const subScriptMatches = [/Services\.scriptloader\.loadSubScript\("(.*?)", this\)/];

const workerImportFilenameMatch = /(.*\/)*((.*?)\.js)/;

/**
 * @typedef {{name: string, writable: boolean, explicit?: boolean}[]} GlobalsList
 *   A list of globals and if they are writeable or not.
 */

/**
 * Parses a list of "name:boolean_value" or/and "name" options divided by comma
 * or whitespace.
 *
 * This function was copied from eslint.js
 *
 * @param {string} string The string to parse.
 * @param {Comment} comment The comment node which has the string.
 * @returns {object} Result map object of names and boolean values
 */
function parseBooleanConfig(string, comment) {
  let items = {};

  // Collapse whitespace around : to make parsing easier
  string = string.replace(/\s*:\s*/g, ":");
  // Collapse whitespace around ,
  string = string.replace(/\s*,\s*/g, ",");

  string.split(/\s|,+/).forEach(function (name) {
    if (!name) {
      return;
    }

    let pos = name.indexOf(":");
    let value;
    if (pos !== -1) {
      value = name.substring(pos + 1, name.length);
      name = name.substring(0, pos);
    }

    items[name] = {
      value: value === "true",
      comment,
    };
  });

  return items;
}

/**
 * When looking for globals in HTML files, it can be common to have more than
 * one script tag with inline javascript. These will normally be called together,
 * so we store the globals for just the last HTML file processed.
 */
var lastHTMLGlobals = {};

/**
 * Attempts to figure out the location for the given script.
 *
 * @param {string} src
 *   The source path or url of the script to look for.
 * @param {string} [dir]
 *   The directory of the current file.
 * @returns {string?}
 */
function getScriptLocation(src, dir) {
  let scriptName;
  if (src.includes("http:")) {
    // We don't handle this currently as the paths are complex to match.
  } else if (src.startsWith("chrome://mochikit/content/")) {
    // Various ways referencing test files.
    src = src.replace("chrome://mochikit/content/", "/");
    scriptName = path.join(helpers.rootDir, "testing", "mochitest", src);
  } else if (src.startsWith("chrome://mochitests/content/browser")) {
    src = src.replace("chrome://mochitests/content/browser", "");
    scriptName = path.join(helpers.rootDir, src);
  } else if (src.includes("SimpleTest")) {
    // This is another way of referencing test files...
    scriptName = path.join(helpers.rootDir, "testing", "mochitest", src);
  } else if (src.startsWith("/tests/")) {
    scriptName = path.join(helpers.rootDir, src.substring(7));
  } else if (src.startsWith("/resources/testharness.js")) {
    scriptName = src;
  } else if (dir) {
    // Fallback to hoping this is a relative path.
    scriptName = path.join(dir, src);
  }
  if (scriptName && fs.existsSync(scriptName)) {
    return scriptName;
  }
  return null;
}

/**
 * Attempts to load the globals for a given script.
 *
 * @param {string} src
 *   The source path or url of the script to look for.
 * @param {string} type
 *   The type of the current file (script/module).
 * @param {string} [dir]
 *   The directory of the current file.
 * @returns {GlobalsList}
 */
function getGlobalsForScript(src, type, dir) {
  if (src.startsWith("/resources/testharness.js")) {
    return Object.keys(testharnessEnvironment.globals).map((name) => ({
      name,
      writable: true,
    }));
  }
  let scriptName = getScriptLocation(src, dir);
  if (scriptName) {
    return globalUtils.getGlobalsForFile({
      filePath: scriptName,
      astOptions: {
        ecmaVersion: helpers.getECMAVersion(),
        sourceType: type,
      },
    });
  }
  return [];
}

/**
 * A class that wraps the standard Map class with some utility functions to
 * simplify adding and extracting details.
 *
 * @augments {Map<string, Set<string>>}
 */
class GraphMap extends Map {
  /**
   * Adds a new element with a specified key and value to the Map. The value
   * will be wrapped in a Set.
   * If an element with the same key already exists, the set will be updated.
   *
   * @param {string} key
   * @param {string} [value]
   */
  addEntry(key, value) {
    let entry = this.get(key);
    if (!entry) {
      super.set(key, new Set(value ? [value] : []));
    } else {
      entry.add(value);
    }
  }

  /**
   * Returns a Set of values that are collated from looking at the graph and
   * sub-graphs from the given key. The initial key is also included in the
   * result.
   *
   * @param {string} key
   */
  getSubGraph(key) {
    let result = new Set([key]);
    /** @type { (innerFile: string) => void} */
    let inner = (innerFile) => {
      result.add(innerFile);
      let initialGraph = this.get(innerFile);
      if (!initialGraph) {
        return;
      }
      for (let file of initialGraph) {
        if (!result.has(file)) {
          inner(file);
        }
      }
    };
    inner(key);
    return result;
  }
}

/**
 * A map of file paths mapped to the files that they directly import via
 * import-globals-from and other constructs.
 */
let fileImportGraph = new GraphMap();

/**
 * A map of file paths mapped to the globals found in those files. These exclude
 * globals imported via import-globals-from.
 *
 * @type {Map<string, { globals: GlobalsList, mtime: number }>}
 */
let fileGlobalsMap = new Map();

/**
 * A class which acts as a AST walker for a files, to extract information
 * about the files which are imported into the file.
 */
class FileImportASTHandler {
  /**
   * The context associated with the current processing. This is used to report
   * any found issues.
   */
  #context;
  /**
   * The directory name of the file being processed.
   */
  #dirname;
  /**
   * The absolute path of the file being processed.
   */
  #path;

  /**
   * @param {string} filePath
   *   The absolute path of the file being parsed.
   * @param {object} context
   *   The context associated with the node.
   */
  constructor(filePath, context) {
    this.#path = filePath;
    this.#context = context;

    if (this.#path) {
      this.#dirname = path.dirname(this.#path);
    } else {
      this.#dirname = null;
    }
  }

  Program(node) {
    if (!this.#dirname) {
      // If this is testing context without path, ignore import-global-from statements.
      return;
    }

    // Look for any import-globals-from statements.
    for (let comment of node.comments) {
      if (comment.type !== "Block") {
        continue;
      }

      let value = comment.value.trim();
      let match = /^import-globals-from\s+(.+)$/.exec(value.replace(/\n/g, ""));
      if (!match) {
        continue;
      }

      let filePath = match[1].trim();

      if (filePath.endsWith(".mjs")) {
        if (this.#context) {
          this.#context.report(
            comment,
            "import-globals-from does not support module files - use a direct import instead"
          );
        } else {
          // Fall back to throwing an error, as we do not have a context in all situations,
          // e.g. when loading the environment.
          throw new Error(
            "import-globals-from does not support module files - use a direct import instead"
          );
        }
        continue;
      }
      if (!path.isAbsolute(filePath)) {
        filePath = path.resolve(this.#dirname, filePath);
      } else {
        filePath = path.join(helpers.rootDir, filePath);
      }
      fileImportGraph.addEntry(this.#path, filePath);
    }
  }

  CallExpression(node) {
    let source;
    try {
      source = helpers.getASTSource(node);
    } catch {
      return;
    }

    for (let reg of subScriptMatches) {
      let match = source.match(reg);
      if (match) {
        let filePath = getScriptLocation(match[1]);
        if (filePath) {
          fileImportGraph.addEntry(this.#path, filePath);
        }
      }
    }

    // Although `importScripts` is only available in workers, we check for it
    // anyway, as it should not be an expensive check, and avoids us having to
    // check if this is a worker or not. Incorrect uses should be detected by
    // the ESLint no-undef rule, as `importScripts` should not be available
    // in the environment for non-workers.
    if (node.callee?.type === "Identifier" && node.callee.name === "importScripts") {
      for (var arg of node.arguments) {
        var match = arg.value && arg.value.match(workerImportFilenameMatch);
        if (match) {
          if (!match[1]) {
            let filePath = path.resolve(this.#dirname, match[2]);
            if (fs.existsSync(filePath)) {
              fileImportGraph.addEntry(this.#path, filePath);
            }
          }
          // Import with relative/absolute path should explicitly use
          // `import-globals-from` comment.
        }
      }
    }
  }
}

/**
 * An object that returns found globals for given AST node types. Each prototype
 * property should be named for a node type and accepts a node parameter and a
 * parents parameter which is a list of the parent nodes of the current node.
 * Each returns an array of globals found.
 */
class GlobalsForNode {
  Program(node) {
    let globals = [];
    for (let comment of node.comments) {
      if (comment.type !== "Block") {
        continue;
      }

      let value = comment.value.trim();
      value = value.replace(/\n/g, "");

      // We have to discover any globals that ESLint would have defined through
      // comment directives.
      let match = /^globals?\s+(.+)/.exec(value);
      if (match) {
        let values = parseBooleanConfig(match[1].trim(), node);
        for (let name of Object.keys(values)) {
          globals.push({
            name,
            writable: values[name].value,
          });
        }
      }
    }

    return globals;
  }

  /**
   * Attempts to convert an AssignmentExpression into a global variable
   * definition if it applies to `this` in the global scope.
   *
   * @param {object} node
   *   The AST node to convert.
   * @param {object} parents
   *   The details of any parents of the current node.
   *
   * @returns {GlobalsList}
   */
  AssignmentExpression(node, parents) {
    let isGlobal = helpers.getIsGlobalThis(parents);
    if (
      isGlobal &&
      node.left?.object?.type === "ThisExpression" &&
      node.left?.property?.type === "Identifier"
    ) {
      return [{ name: node.left.property.name, writable: true }];
    }
    return [];
  }

  /**
   * Attempts to convert a CallExpression that looks like a module import
   * into global variable definitions.
   *
   * @param {object} node
   *   The AST node to convert.
   * @param {object} parents
   *   The details of any parents of the current node.
   * @returns {GlobalsList}
   */
  CallExpression(node, parents) {
    let isGlobal = helpers.getIsGlobalThis(parents);
    if (
      node.type === "CallExpression" &&
      node.callee.type === "MemberExpression" &&
      node.callee.object?.type === "Identifier" &&
      node.arguments[0]?.type === "ArrayExpression" &&
      node.callee.property.type === "Identifier" &&
      node.callee.property.name === "importGlobalProperties"
    ) {
      return node.arguments[0].elements.map((literal) => {
        return {
          explicit: true,
          name: literal.value,
          writable: false,
        };
      });
    }

    // The definition matches below must be in the global scope for us to define
    // a global, so bail out early if we're not a global.
    if (!isGlobal) {
      return [];
    }

    let source;
    try {
      source = helpers.getASTSource(node);
    } catch {
      return [];
    }

    for (let reg of callExpressionDefinitions) {
      let match = source.match(reg);
      if (match) {
        return [{ name: match[1], writable: true, explicit: true }];
      }
    }

    if (
      callExpressionMultiDefinitions.some((expr) => source.startsWith(expr)) &&
      node.arguments[1]
    ) {
      let arg = node.arguments[1];
      if (arg.type === "ObjectExpression") {
        return arg.properties
          .map((p) => ({
            name: p.type === "Property" && p.key.name,
            writable: true,
            explicit: true,
          }))
          .filter((g) => g.name);
      }
      if (arg.type === "ArrayExpression") {
        return arg.elements
          .map((p) => ({
            name: p.type === "Literal" && p.value,
            writable: true,
            explicit: true,
          }))
          .filter((g) => typeof g.name == "string");
      }
    }

    if (
      node.callee.type == "MemberExpression" &&
      node.callee.property.type == "Identifier" &&
      node.callee.property.name == "defineLazyScriptGetter"
    ) {
      // The case where we have a single symbol as a string has already been
      // handled by the regexp, so we have an array of symbols here.
      return node.arguments[1].elements.map((n) => ({
        name: n.value,
        writable: true,
        explicit: true,
      }));
    }

    return [];
  }
}

let globalUtils = {
  /**
   * Ensures that there is a complete file import tree for the given filePath.
   *
   * @param {object} options
   * @param {string} options.filePath
   *   The path of the file to start from.
   * @param {object} [options.context]
   *   The ESLint rule context for the current file being processed.
   * @param {object} [options.astOptions]
   *   Any AST options that the parser needs.
   * @returns {GraphMap}
   *   Returned to allow tests to check correct behaviour.
   */
  ensureFileTree({ filePath, context = null, astOptions = {} }) {
    if (fileImportGraph.has(filePath)) {
      return fileImportGraph;
    }

    fileImportGraph.addEntry(filePath);
    let content = fs.readFileSync(filePath, "utf8");

    // Parse the content into an AST
    let { ast, visitorKeys } = helpers.parseCode(filePath, content, astOptions);

    let handler = new FileImportASTHandler(filePath, context);
    // Now find all the imports.
    helpers.walkAST(ast, visitorKeys, (type, node) => {
      if (type in handler) {
        handler[type](node);
      }
    });

    // Now ensure we have import details for all the imports.
    for (let file of fileImportGraph.get(filePath)) {
      this.ensureFileTree({ filePath: file, context, astOptions });
    }

    return fileImportGraph;
  },

  /**
   * Returns all globals for a given file. Recursively searches through
   * import-globals-from directives and also includes globals defined by
   * standard eslint directives.
   *
   * @param {object} options
   * @param {string} [options.filePath]
   *   The absolute path of the file to be parsed.
   * @param {object} [options.context]
   *   The ESLint rule context for the current file being processed.
   * @param {object} [options.astOptions]
   *   Any AST options that the parser needs.
   */
  getGlobalsForFile({ filePath, context = null, astOptions = {} }) {
    // First identify the full import graph.
    this.ensureFileTree({ filePath, context, astOptions });

    /** @type {GlobalsList} */
    let globals = [];

    // Now look for the globals in all of the files imported by this one.
    for (let file of fileImportGraph.getSubGraph(filePath).values()) {
      if (fileGlobalsMap.has(file)) {
        let entry = fileGlobalsMap.get(file);
        if (entry.mtime == getFileMtime(file)) {
          globals = [...globals, ...entry.globals];
          continue;
        }
        fileGlobalsMap.delete(file);
      }
      let mtime = getFileMtime(file);
      let content = fs.readFileSync(file, "utf8");

      // Parse the content into an AST
      let { ast, scopeManager, visitorKeys } = helpers.parseCode(filePath, content, astOptions);

      // Discover global declarations
      let globalScope = scopeManager.acquire(ast);

      /** @type {GlobalsList} */
      let globalsInFile = Object.keys(globalScope.variables).map((v) => ({
        name: globalScope.variables[v].name,
        writable: true,
      }));

      // Walk over the AST to find any of our custom globals
      let handler = new GlobalsForNode();

      helpers.walkAST(ast, visitorKeys, (type, node, parents) => {
        if (type in handler) {
          let newGlobals = handler[type](node, parents);
          globalsInFile.push(...newGlobals);
        }
      });
      fileGlobalsMap.set(file, { globals: globalsInFile, mtime });

      globals = [...globals, ...globalsInFile];
    }

    return globals;
  },

  /**
   * Returns all globals for a code.
   * This is only for testing.
   *
   * @param  {string} code
   *         The JS code
   * @param  {object} astOptions
   *         Extra options to pass to the parser.
   */
  getGlobalsForCode(code, astOptions = {}) {
    // Parse the content into an AST
    let { ast, scopeManager, visitorKeys } = helpers.parseCode(filePath, code, astOptions);

    // Discover global declarations
    let globalScope = scopeManager.acquire(ast);

    /** @type {GlobalsList} */
    let globals = Object.keys(globalScope.variables).map((v) => ({
      name: globalScope.variables[v].name,
      writable: true,
    }));

    // Walk over the AST to find any of our custom globals
    let handler = new GlobalsForNode();

    helpers.walkAST(ast, visitorKeys, (type, node, parents) => {
      if (type in handler) {
        let newGlobals = handler[type](node, parents);
        globals.push.apply(globals, newGlobals);
      }
    });

    return globals;
  },

  /**
   * Returns all the globals for an html file that are defined by imported
   * scripts (i.e. <script src="foo.js">).
   *
   * This function will cache results for one html file only - we expect
   * this to be called sequentially for each chunk of a HTML file, rather
   * than chucks of different files in random order.
   *
   * @param  {string} filePath
   *         The absolute path of the file to be parsed.
   * @returns {GlobalsList}
   */
  getImportedGlobalsForHTMLFile(filePath) {
    if (lastHTMLGlobals.filename === filePath) {
      return lastHTMLGlobals.globals;
    }

    let dir = path.dirname(filePath);
    let globals = [];

    let content = fs.readFileSync(filePath, "utf8");
    let scriptSrcs = [];

    // We use htmlparser as this ensures we find the script tags correctly.
    let parser = new htmlparser.Parser(
      {
        onopentag(name, attribs) {
          if (name === "script" && "src" in attribs) {
            scriptSrcs.push({
              src: attribs.src,
              type: "type" in attribs && attribs.type == "module" ? "module" : "script",
            });
          }
        },
      },
      {
        xmlMode: filePath.endsWith("xhtml"),
      }
    );

    parser.parseComplete(content);

    for (let script of scriptSrcs) {
      // Ensure that the script src isn't just "".
      if (!script.src) {
        continue;
      }
      globals.push(...getGlobalsForScript(script.src, script.type, dir));
    }

    lastHTMLGlobals.filePath = filePath;
    return (lastHTMLGlobals.globals = globals);
  },

  /**
   * Intended to be used as-is for an ESLint rule that parses for globals in
   * the current file and recurses through import-globals-from directives.
   *
   * @param  {object} context
   *         The ESLint parsing context.
   */
  getESLintGlobalParser(context) {
    let filename = context.filename;

    return {
      Program: (node) => {
        let globalScope = context.sourceCode.getScope(node);
        if (filename.endsWith(".html") || filename.endsWith(".xhtml")) {
          let filePath = helpers.getAbsoluteFilePath(context);
          let globals = globalUtils.getImportedGlobalsForHTMLFile(filename);
          helpers.addGlobals(globals, globalScope);

          let fileImportHandler = new FileImportASTHandler(filePath, context);
          fileImportHandler.Program(node);
          for (let file of fileImportGraph.getSubGraph(filePath)) {
            if (file == filePath) {
              continue;
            }
            globals = globalUtils.getGlobalsForFile({
              filePath: file,
              context,
              astOptions: {
                ...context.languageOptions?.parserOptions,
              },
            });
            helpers.addGlobals(globals, globalScope);
          }
        } else {
          let globals = globalUtils.getGlobalsForFile({
            filePath: filename,
            context,
            astOptions: {
              ...context.languageOptions?.parserOptions,
            },
          });
          helpers.addGlobals(globals, globalScope);
        }
      },
    };
  },

  /**
   * Used for tests to clear the import graph and globals map in-between tests.
   */
  clearFileImportGraph() {
    fileImportGraph.clear();
    fileGlobalsMap.clear();
  },
};

export default globalUtils;
