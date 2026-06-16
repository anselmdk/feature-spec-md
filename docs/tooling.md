# Tooling

The CLI loads model, feature, stack, and design files.

Default spec patterns:

```txt
specs/**/*.model.md,specs/**/*.feature.md,specs/**/*.stack.md,specs/**/*.design.md
```

The check command validates:

- model files
- feature files
- stack files
- design files
- model references from feature and design frontmatter
- duplicate stable IDs across loaded documents
- test references to model item IDs, rule IDs, and scenario IDs

The report command renders model documents and feature scenarios with screenshot evidence. Stack and design documents are loaded, validated, and counted.

The coverage command prints a terminal summary of feature spec implementation
state. A feature spec is implemented when every scenario in that spec has a
matching test reference. Specs with some scenario references are listed as
partial, and specs with no scenario references are listed as not implemented.
Model item coverage is always shown when model specs are loaded.

Coverage defaults:

- scenario coverage is the normal default
- rule coverage is optional

Strictness flags:

```bash
--require-rule-coverage
--require-scenario-coverage=false
```
