# Tooling

The CLI loads model and feature files.

Default spec patterns:

```txt
specs/**/*.model.md,specs/**/*.feature.md
```

The check command validates model files, feature files, model references, duplicate IDs, and test references to model item IDs.

The report command still renders feature scenarios and screenshot evidence. Model documents are loaded and validated as part of the check step. A later report iteration should add a dedicated model section.
