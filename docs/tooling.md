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

Coverage defaults:

- scenario coverage is the normal default
- rule coverage is optional
- model item coverage is optional

Strictness flags:

```bash
--require-model-coverage
--require-rule-coverage
--require-scenario-coverage=false
```
