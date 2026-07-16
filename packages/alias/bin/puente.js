#!/usr/bin/env node
// `@pauldvlp/puente` is a thin alias for the `puente` package: same tool, scoped name.
// It declares `puente` as a dependency and simply hands off to its CLI, which reads
// process.argv itself — so every command, flag and env var behaves identically.
require('puente/dist/cli.js');
