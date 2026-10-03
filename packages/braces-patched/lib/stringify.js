'use strict';

const utils = require('./utils');

module.exports = (ast, options = {}) => {
  // Citizens patch (GHSA-vfj7-8cjw-p6xm): `stringify` recurses once per nested block. The parser
  // already caps nesting, but an AST passed straight to braces.stringify() never went through it.
  const maxDepth = utils.maxDepth(options);

  const stringify = (node, parent = {}, depth = 0) => {
    if (node.nodes && depth > maxDepth) throw utils.depthError('AST', depth, maxDepth);

    const invalidBlock = options.escapeInvalid && utils.isInvalidBrace(parent);
    const invalidNode = node.invalid === true && options.escapeInvalid === true;
    let output = '';

    if (node.value) {
      if ((invalidBlock || invalidNode) && utils.isOpenOrClose(node)) {
        return '\\' + node.value;
      }
      return node.value;
    }

    if (node.value) {
      return node.value;
    }

    if (node.nodes) {
      for (const child of node.nodes) {
        // `parent` stays unset, exactly as upstream (changing it would change escapeInvalid output).
        output += stringify(child, undefined, depth + 1);
      }
    }
    return output;
  };

  return stringify(ast);
};

