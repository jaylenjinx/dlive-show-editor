# dLive Director scene automation (macOS)

`tools/director_automation.py` creates controlled reverse-engineering scenes by driving **dLive Director** with calibrated mouse/keyboard actions.

It is intentionally conservative:

- `run` is a **dry-run by default**;
- live automation requires `--arm`;
- live mode asks you to type `OFFLINE` before it starts unless `--yes` is supplied;
- moving the pointer into the **top-left corner** aborts between actions;
- screenshots can be saved after every parameter entry and scene store;
- the script never edits a dLive show archive directly.

Use an offline/Preview-mode Director instance. Do not run the automation against a Director session controlling live audio.

## 1. Check macOS permissions

```bash
python tools/director_automation.py doctor
```

Your Terminal/Python host needs **Accessibility** permission to send mouse/keyboard events. Screen Recording permission is only needed for evidence screenshots.

## 2. Create or edit a sweep

A ready-to-edit Echo 3–6 sweep is included:

```bash
python tools/director_automation.py list tools/director/echo3-6.toml
```

The TOML format is deliberately small:

```toml
version = 1
control_scenes = ["CTL 1", "CTL 2"]

[[sweeps]]
control = "echo3.time"
scene = "E3 TIME {value}"
entry = "{value}"
values = [0, 100, 200]
```

Each sweep value becomes one scene. The two control scenes are stored first without changing a parameter, giving the parameter checker a clean cross-file/control baseline.

You can generate the sample template elsewhere with:

```bash
python tools/director_automation.py make-template ~/Desktop/echo3-6.toml
```

TOML and JSON require no third-party packages. YAML is supported when PyYAML is installed.

## 3. Calibrate your Director layout

Put Director on the exact screen layout you plan to use, then run:

```bash
python tools/director_automation.py calibrate \
  tools/director/echo3-6.toml \
  ~/Desktop/director-profile.json
```

The wizard asks you to hover over:

1. a harmless blank Director area;
2. the Scene Manager button/tab;
3. the first scene row to use;
4. the next scene row (to measure spacing);
5. Store / Store All;
6. the scene-name field;
7. the final Store/OK confirmation;
8. the button/tab that returns to the RackUltra processing page;
9. every parameter field referenced by the sweep.

Calibration **does not click anything**. For each point, press Enter in Terminal and then move the pointer onto the requested Director control during the 3-second countdown; the pointer position is captured automatically.

Do not move or resize Director after calibration.

## 4. Inspect the dry-run

Always run this first:

```bash
python tools/director_automation.py run \
  tools/director/echo3-6.toml \
  ~/Desktop/director-profile.json
```

It prints every action without touching Director, for example:

```text
[002] E3 TIME 0  [echo3.time=0]
   - click control echo3.time x1 @ (1420.0,614.0)
   - hotkey cmd+a
   - type '0'
   - key enter
   - click scene_manager @ (...)
   - click scene row 2 @ (...)
   - ...
```

## 5. Run the scene generator

When the dry-run looks correct:

```bash
python tools/director_automation.py run \
  tools/director/echo3-6.toml \
  ~/Desktop/director-profile.json \
  --arm
```

The script activates Director, asks for the `OFFLINE` confirmation, counts down, and runs the calibrated workflow.

Evidence screenshots are written to a timestamped `director-runs/` directory unless `--no-screenshots` is used.

## Resuming after an abort

The expanded sweep uses zero-based item numbers. To resume at item 14:

```bash
python tools/director_automation.py run sweep.toml profile.json --from-item 14
```

Or run only a range:

```bash
python tools/director_automation.py run sweep.toml profile.json --from-item 14 --to-item 19
```

Do another dry-run with the range before adding `--arm`.

## Long scene lists

The generated profile defaults to:

```json
"row_mode": "coordinate"
```

That computes every target row from the two rows captured during calibration. This is best when all target rows stay visible.

If Director preserves the selected scene when you leave and reopen Scene Manager, you can change the profile to:

```json
"row_mode": "selected"
```

In that mode the first target row is clicked once and later stores select the next row with the Down Arrow, avoiding off-screen coordinate extrapolation. Test this carefully with a short disposable sweep first because the exact Scene Manager behaviour can vary with layout/state.

## Custom controls / workflows

Each calibrated control has its own `set_workflow`. The default is:

```json
[
  {"click_control": true},
  {"hotkey": ["cmd", "a"]},
  {"type": "{entry}"},
  {"key": "enter"},
  {"sleep": 0.30}
]
```

That works for Director numeric fields that accept keyboard entry. You can edit a control's workflow for dropdowns/toggles using the same primitives: `click`, `click_control`, `click_scene_row`, `hotkey`, `key`, `type`, and `sleep`.

The scene-store workflow is also stored in the profile, so if your Director layout uses a different store/name/confirm sequence you can change it without modifying Python.

## After Director finishes

Export the show from Director, then run the automated checker:

```bash
python tools/dlive_re.py discover ReverseEngineer3.tar.gz
python tools/dlive_re.py validate ReverseEngineer3.tar.gz --strict
```

This gives the full loop:

```text
sweep TOML
   ↓
Director automation
   ↓
exported .tar.gz
   ↓
dLive parameter checker
   ↓
known mappings + candidate offsets/transforms
```

## Current limitation

The first version uses calibrated coordinates plus keyboard entry. It does not yet read Director's value text back through Accessibility or OCR. The screenshots provide an audit trail, and the exported-show checker remains the authoritative binary verification step.
