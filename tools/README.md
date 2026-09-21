# dLive parameter checker

`dlive_re.py` automates the controlled-scene workflow used to reverse-engineer dLive show files. It reads the outer show archive and nested `StageBoxSceneNNN.tar.gz` archives directly; no third-party Python packages are required.

## Commands

```bash
python tools/dlive_re.py discover ReverseEngineer3.tar.gz
python tools/dlive_re.py validate ReverseEngineer3.tar.gz
python tools/dlive_re.py diff ReverseEngineer3.tar.gz 31 32
```

`discover` compares adjacent StageBox scene IDs (gap 1 by default), ignores scene-name metadata by comparing recognised framed record states, labels offsets already in the verified map, and groups 3+ numeric scene names to suggest transforms such as `raw = 0x8000 + 16 × value`.

`validate` classifies each controlled pair as `PASS`, `PASS_MULTI`, `PARTIAL`, or `NEW`. Where a scene name contains enough information for an exact encoding, it also runs a writer check against the target raw bytes. Use `--strict` in CI or scripts to return exit status 1 for new/partial fields or a writer-check failure.

`diff` gives a detailed two-scene report with record label, state-relative offset, before/after bytes, known-field name, and decoded values where a transform is available.

All commands accept `--json` for machine-readable output. `discover` and `validate` accept `--max-gap N` when a controlled series intentionally leaves gaps between scene numbers.

## Scene naming

Numeric labels make discovery much more useful. Examples:

```text
E3 TIME 0
E3 TIME 100
E3 TIME 200

E3 FB -40
E3 FB -10
E3 FB 10
```

The checker understands numbers at either end of a label and normalises explicit `Hz/kHz`, `us/ms/s`, `dB`, and `%` suffixes.

## Browser UI

The editor also includes a **Parameter checker** tab. After opening a show, click **Analyse adjacent scenes** to produce the same record-relative change view in the browser and download the report as JSON.

The checker is read-only. It never changes a show file.
