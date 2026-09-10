# Show archive layout

**Status:** high confidence container structure.

A dLive show is a gzip-compressed TAR archive containing `Show/...` entries. Important paths observed in the reference show include:

```text
Show/
├── Version.dat
├── MixConfig/MixConfig.dat
└── Scenes/
    ├── StageBoxSceneNNN.tar.gz
    ├── SurfaceSceneNNN.tar.gz
    └── ...
```

`StageBoxSceneNNN.tar.gz` and `SurfaceSceneNNN.tar.gz` are themselves gzip-compressed TAR archives containing the principal scene `.dat` payloads.

## Editor safety behaviour

The editor preserves unknown outer archive entries. Only nested scene archives that were modified are rebuilt. Before export, the generated archive is reopened and checked for expected outer entries and modified nested scene payloads.

## Current target

The primary parameter-level reverse-engineering target is dLive **2.12**. Older factory scenes are valuable structural references but are not automatically assumed to use identical optional/state layouts for every processor.
