#!/usr/bin/env python3
"""macOS automation runner for building controlled dLive Director scene sweeps.

The live runner is intentionally opt-in: `run` is a dry-run unless --arm is
supplied. It uses only the Python standard library and native macOS APIs.

Typical workflow:
  python tools/director_automation.py make-template sweeps/echo3-6.toml
  python tools/director_automation.py calibrate sweeps/echo3-6.toml profiles/director-local.json
  python tools/director_automation.py run sweeps/echo3-6.toml profiles/director-local.json
  python tools/director_automation.py run sweeps/echo3-6.toml profiles/director-local.json --arm
"""
from __future__ import annotations

import argparse
import ctypes
import ctypes.util
import dataclasses
import json
import os
import platform
import re
import shlex
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Iterable

try:
    import tomllib
except ModuleNotFoundError:  # pragma: no cover - Python <3.11
    tomllib = None

PROFILE_VERSION = 1
SWEEP_VERSION = 1
FAILSAFE_EDGE_PX = 6

# CGEventFlags masks for modifier clicks.
MODIFIER_FLAGS = {"shift": 0x20000, "ctrl": 0x40000, "control": 0x40000, "alt": 0x80000, "option": 0x80000, "cmd": 0x100000, "command": 0x100000}

DEFAULT_SCENE_WORKFLOW = [
    {"click": "scene_manager"},
    {"sleep": 0.45},
    {"click_scene_row": True},
    {"sleep": 0.12},
    {"click": "store_button"},
    {"sleep": 0.30},
    {"click": "scene_name_field"},
    {"hotkey": ["cmd", "a"]},
    {"type": "{scene}"},
    {"sleep": 0.10},
    {"click": "scene_confirm"},
    {"sleep": 0.55},
    {"click": "return_processing"},
    {"sleep": 0.30},
]

# Director opens a numeric entry box on ctrl-click; a plain click does not accept typing.
DEFAULT_SET_WORKFLOW = [
    {"click_control": True, "modifiers": ["ctrl"]},
    {"hotkey": ["cmd", "a"]},
    {"type": "{entry}"},
    {"key": "enter"},
    {"sleep": 0.30},
]

KEY_CODES = {
    "enter": 36,
    "return": 36,
    "tab": 48,
    "space": 49,
    "escape": 53,
    "esc": 53,
    "left": 123,
    "right": 124,
    "down": 125,
    "up": 126,
    "delete": 51,
    "backspace": 51,
}

@dataclasses.dataclass(frozen=True)
class SweepItem:
    index: int
    scene: str
    control: str | None
    value: Any = None
    entry: str | None = None
    kind: str = "parameter"


class ConfigError(ValueError):
    pass


def _load_text_config(path: str | Path) -> dict[str, Any]:
    path = Path(path)
    suffix = path.suffix.lower()
    if suffix == ".json":
        return json.loads(path.read_text(encoding="utf-8"))
    if suffix == ".toml":
        if tomllib is None:
            raise ConfigError("TOML requires Python 3.11+ (tomllib).")
        with path.open("rb") as f:
            return tomllib.load(f)
    if suffix in (".yaml", ".yml"):
        try:
            import yaml  # type: ignore
        except ImportError as exc:
            raise ConfigError("YAML is optional. Install PyYAML or use TOML/JSON.") from exc
        with path.open("r", encoding="utf-8") as f:
            obj = yaml.safe_load(f)
        if not isinstance(obj, dict):
            raise ConfigError("YAML root must be a mapping.")
        return obj
    raise ConfigError(f"Unsupported config type: {suffix}. Use .toml, .json, or optional .yaml/.yml.")


def load_sweep(path: str | Path) -> dict[str, Any]:
    data = _load_text_config(path)
    if int(data.get("version", 0)) != SWEEP_VERSION:
        raise ConfigError(f"Sweep version must be {SWEEP_VERSION}.")
    sweeps = data.get("sweeps")
    if not isinstance(sweeps, list) or not sweeps:
        raise ConfigError("Sweep config needs a non-empty [[sweeps]] list.")
    for n, sweep in enumerate(sweeps, 1):
        if not isinstance(sweep, dict):
            raise ConfigError(f"Sweep #{n} must be a mapping.")
        if not sweep.get("control"):
            raise ConfigError(f"Sweep #{n} is missing control.")
        vals = sweep.get("values")
        if not isinstance(vals, list) or not vals:
            raise ConfigError(f"Sweep #{n} needs a non-empty values list.")
        if not sweep.get("scene"):
            raise ConfigError(f"Sweep #{n} is missing scene template.")
    return data


def load_profile(path: str | Path) -> dict[str, Any]:
    data = _load_text_config(path)
    if int(data.get("version", 0)) != PROFILE_VERSION:
        raise ConfigError(f"Profile version must be {PROFILE_VERSION}.")
    if not data.get("application_name"):
        raise ConfigError("Profile is missing application_name.")
    if not isinstance(data.get("points"), dict):
        raise ConfigError("Profile is missing points mapping.")
    if not isinstance(data.get("controls"), dict):
        raise ConfigError("Profile is missing controls mapping.")
    return data


def _fmt(template: str, **ctx: Any) -> str:
    try:
        return str(template).format(**ctx)
    except (KeyError, ValueError) as exc:
        raise ConfigError(f"Invalid format template {template!r}: {exc}") from exc


def expand_sweep(data: dict[str, Any]) -> list[SweepItem]:
    items: list[SweepItem] = []
    control_scenes = data.get("control_scenes", ["CTL 1", "CTL 2"])
    if control_scenes is None:
        control_scenes = []
    if not isinstance(control_scenes, list):
        raise ConfigError("control_scenes must be a list of scene names.")
    for scene in control_scenes:
        items.append(SweepItem(len(items), str(scene), None, kind="control"))
    for sweep in data["sweeps"]:
        control = str(sweep["control"])
        scene_tmpl = str(sweep["scene"])
        entry_tmpl = str(sweep.get("entry", "{value}"))
        for value in sweep["values"]:
            ctx = {"value": value, "control": control}
            scene = _fmt(scene_tmpl, **ctx)
            entry = _fmt(entry_tmpl, **ctx)
            items.append(SweepItem(len(items), scene, control, value=value, entry=entry, kind="parameter"))
    return items


def unique_controls(items: Iterable[SweepItem]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for item in items:
        if item.control and item.control not in seen:
            seen.add(item.control)
            out.append(item.control)
    return out


def sanitize_filename(text: str) -> str:
    text = re.sub(r"[^A-Za-z0-9._+-]+", "_", text.strip())
    return text.strip("._") or "scene"


def build_default_profile(sweep: dict[str, Any], captured: dict[str, list[float]] | None = None) -> dict[str, Any]:
    captured = captured or {}
    items = expand_sweep(sweep)
    controls = {}
    for name in unique_controls(items):
        controls[name] = {
            "point": captured.get("control:" + name, [0, 0]),
            "clicks": 1,
            "set_workflow": DEFAULT_SET_WORKFLOW,
        }
    first = captured.get("scene_first_row", [0, 0])
    second = captured.get("scene_second_row", [first[0], first[1] + 24])
    row_step = [second[0] - first[0], second[1] - first[1]]
    return {
        "version": PROFILE_VERSION,
        "application_name": sweep.get("application_name", "dLive Director"),
        "action_delay": 0.12,
        "points": {
            "focus_safe": captured.get("focus_safe", [0, 0]),
            "scene_manager": captured.get("scene_manager", [0, 0]),
            "scene_first_row": first,
            "store_button": captured.get("store_button", [0, 0]),
            "scene_name_field": captured.get("scene_name_field", [0, 0]),
            "scene_confirm": captured.get("scene_confirm", [0, 0]),
            "return_processing": captured.get("return_processing", [0, 0]),
        },
        "scene": {
            "row_mode": "coordinate",
            "row_step": row_step,
            "start_offset": int(sweep.get("start_row_offset", 0)),
            "workflow": DEFAULT_SCENE_WORKFLOW,
        },
        "controls": controls,
        "screenshots": {
            "enabled": True,
            "after_set": True,
            "after_store": True,
        },
    }


def validate_profile_for_sweep(profile: dict[str, Any], sweep: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    points = profile.get("points", {})
    required_points = ["focus_safe", "scene_manager", "scene_first_row", "store_button", "scene_name_field", "scene_confirm", "return_processing"]
    for name in required_points:
        p = points.get(name)
        if not (isinstance(p, list) and len(p) == 2 and all(isinstance(x, (int, float)) for x in p)):
            errors.append(f"Missing/invalid point: {name}")
    row_step = profile.get("scene", {}).get("row_step")
    if not (isinstance(row_step, list) and len(row_step) == 2 and all(isinstance(x, (int, float)) for x in row_step)):
        errors.append("scene.row_step must be [dx, dy]")
    controls = profile.get("controls", {})
    for name in unique_controls(expand_sweep(sweep)):
        c = controls.get(name)
        if not isinstance(c, dict):
            errors.append(f"Missing control calibration: {name}")
            continue
        p = c.get("point")
        if not (isinstance(p, list) and len(p) == 2 and all(isinstance(x, (int, float)) for x in p)):
            errors.append(f"Invalid point for control: {name}")
    return errors


class MacAutomation:
    def __init__(self, action_delay: float = 0.12, failsafe: bool = True):
        if platform.system() != "Darwin":
            raise RuntimeError("Live Director automation is macOS-only.")
        self.action_delay = max(0.0, float(action_delay))
        self.failsafe = failsafe
        app_path = "/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices"
        cf_path = "/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation"
        self.app = ctypes.cdll.LoadLibrary(app_path)
        self.cf = ctypes.cdll.LoadLibrary(cf_path)
        self._CGPoint = type("CGPoint", (ctypes.Structure,), {"_fields_": [("x", ctypes.c_double), ("y", ctypes.c_double)]})
        self.app.CGEventCreate.restype = ctypes.c_void_p
        self.app.CGEventGetLocation.argtypes = [ctypes.c_void_p]
        self.app.CGEventGetLocation.restype = self._CGPoint
        self.app.CGEventCreateMouseEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint32, self._CGPoint, ctypes.c_uint32]
        self.app.CGEventCreateMouseEvent.restype = ctypes.c_void_p
        self.app.CGEventPost.argtypes = [ctypes.c_uint32, ctypes.c_void_p]
        self.app.CGEventSetFlags.argtypes = [ctypes.c_void_p, ctypes.c_uint64]
        self.cf.CFRelease.argtypes = [ctypes.c_void_p]
        self.app.AXIsProcessTrusted.restype = ctypes.c_bool
        if hasattr(self.app, "CGPreflightScreenCaptureAccess"):
            self.app.CGPreflightScreenCaptureAccess.restype = ctypes.c_bool

    def accessibility_trusted(self) -> bool:
        return bool(self.app.AXIsProcessTrusted())

    def screen_capture_trusted(self) -> bool | None:
        if hasattr(self.app, "CGPreflightScreenCaptureAccess"):
            return bool(self.app.CGPreflightScreenCaptureAccess())
        return None

    def mouse_position(self) -> tuple[float, float]:
        event = self.app.CGEventCreate(None)
        if not event:
            raise RuntimeError("CGEventCreate failed")
        try:
            p = self.app.CGEventGetLocation(event)
            return (float(p.x), float(p.y))
        finally:
            self.cf.CFRelease(event)

    def _check_failsafe(self) -> None:
        if not self.failsafe:
            return
        x, y = self.mouse_position()
        if x <= FAILSAFE_EDGE_PX and y <= FAILSAFE_EDGE_PX:
            raise KeyboardInterrupt("Failsafe triggered: pointer moved to the top-left corner.")

    def click(self, point: list[float] | tuple[float, float], clicks: int = 1, modifiers: Iterable[str] = ()) -> None:
        self._check_failsafe()
        p = self._CGPoint(float(point[0]), float(point[1]))
        flags = 0
        for mod in modifiers:
            if mod.lower() not in MODIFIER_FLAGS:
                raise ConfigError(f"Unknown click modifier: {mod}")
            flags |= MODIFIER_FLAGS[mod.lower()]
        # Move first: Director ignores some clicks that arrive without a preceding pointer move.
        event = self.app.CGEventCreateMouseEvent(None, 5, p, 0)  # mouseMoved
        if event:
            self.app.CGEventPost(0, event)
            self.cf.CFRelease(event)
            time.sleep(0.05)
        for _ in range(max(1, int(clicks))):
            for event_type in (1, 2):  # leftMouseDown, leftMouseUp
                event = self.app.CGEventCreateMouseEvent(None, event_type, p, 0)
                if not event:
                    raise RuntimeError("CGEventCreateMouseEvent failed")
                if flags:
                    self.app.CGEventSetFlags(event, flags)
                self.app.CGEventPost(0, event)  # kCGHIDEventTap
                self.cf.CFRelease(event)
                time.sleep(0.025)
            time.sleep(0.06)
        time.sleep(self.action_delay)

    @staticmethod
    def _applescript_string(text: str) -> str:
        return text.replace("\\", "\\\\").replace('"', '\\"')

    def _osascript_capture(self, script: str) -> str:
        self._check_failsafe()
        proc = subprocess.run(["/usr/bin/osascript", "-e", script], text=True, capture_output=True)
        if proc.returncode:
            raise RuntimeError((proc.stderr or proc.stdout or "osascript failed").strip())
        time.sleep(self.action_delay)
        return proc.stdout.strip()

    def _osascript(self, script: str) -> None:
        self._osascript_capture(script)

    def running_application_processes(self) -> list[str]:
        script = (
            'tell application "System Events"\n'
            'set namesList to name of every application process\n'
            'set AppleScript\'s text item delimiters to ASCII character 10\n'
            'return namesList as text\n'
            'end tell'
        )
        output = self._osascript_capture(script)
        return [line.strip() for line in output.splitlines() if line.strip()]

    def director_processes(self) -> list[str]:
        names = self.running_application_processes()
        exact = [n for n in names if "dlive" in n.lower() and "director" in n.lower()]
        if exact:
            return exact
        return [n for n in names if "dlive" in n.lower()]

    @staticmethod
    def installed_director_apps() -> list[Path]:
        roots = [Path("/Applications"), Path.home() / "Applications"]
        found: list[Path] = []
        seen: set[str] = set()
        for root in roots:
            if not root.exists():
                continue
            for app in root.rglob("*.app"):
                name = app.name.lower()
                if "dlive" not in name or "director" not in name:
                    continue
                key = str(app.resolve())
                if key not in seen:
                    seen.add(key)
                    found.append(app)
        return found

    def _activate_process(self, process_name: str) -> None:
        name = self._applescript_string(process_name)
        self._osascript(
            'tell application "System Events" to set frontmost of application process "'
            + name + '" to true'
        )

    def activate(self, application_name: str) -> str:
        proc = subprocess.run(
            ["/usr/bin/open", "-a", application_name],
            text=True,
            capture_output=True,
        )
        if proc.returncode == 0:
            time.sleep(0.5)
            matches = self.director_processes()
            if matches:
                self._activate_process(matches[0])
                return matches[0]

        matches = self.director_processes()
        if matches:
            self._activate_process(matches[0])
            return matches[0]

        apps = self.installed_director_apps()
        for app in apps:
            launched = subprocess.run(["/usr/bin/open", str(app)], text=True, capture_output=True)
            if launched.returncode != 0:
                continue
            time.sleep(1.0)
            matches = self.director_processes()
            if matches:
                self._activate_process(matches[0])
                return matches[0]

        candidates = ", ".join(str(x) for x in apps) or "none found"
        raise RuntimeError(
            f'Could not find or activate dLive Director. Configured name: {application_name!r}. '
            f'Installed Director app candidates: {candidates}. '
            'Open Director manually, then run python3 tools/director_automation.py doctor '
            'to see the detected process name.'
        )

    def type_text(self, text: str) -> None:
        value = self._applescript_string(str(text))
        self._osascript(f'tell application "System Events" to keystroke "{value}"')

    def hotkey(self, keys: list[str]) -> None:
        if not keys:
            return
        key = keys[-1].lower()
        mods = []
        for mod in keys[:-1]:
            m = mod.lower()
            mods.append({"cmd": "command down", "command": "command down", "shift": "shift down", "alt": "option down", "option": "option down", "ctrl": "control down", "control": "control down"}.get(m, m + " down"))
        if key in KEY_CODES:
            use = f" using {{{', '.join(mods)}}}" if mods else ""
            self._osascript(f'tell application "System Events" to key code {KEY_CODES[key]}{use}')
        else:
            use = f" using {{{', '.join(mods)}}}" if mods else ""
            self._osascript(f'tell application "System Events" to keystroke "{self._applescript_string(key)}"{use}')

    def key(self, key: str) -> None:
        self.hotkey([key])

    def screenshot(self, path: str | Path) -> bool:
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        proc = subprocess.run(["/usr/sbin/screencapture", "-x", str(path)], capture_output=True)
        return proc.returncode == 0 and path.exists()


def capture_point(mac: MacAutomation, prompt: str, move_seconds: int = 3) -> list[float]:
    print("\n" + prompt)
    input(f"Press Enter, then you have {move_seconds} seconds to move the pointer onto that Director control> ")
    for n in range(move_seconds, 0, -1):
        print(f"Capturing in {n}…", end="\r", flush=True)
        time.sleep(1)
    x, y = mac.mouse_position()
    print(" " * 40, end="\r")
    print(f"Captured: x={x:.1f}, y={y:.1f}")
    return [round(x, 1), round(y, 1)]


def command_doctor(args: argparse.Namespace) -> int:
    print(f"Platform: {platform.platform()}")
    if platform.system() != "Darwin":
        print("Live automation requires macOS.")
        return 1
    mac = MacAutomation()
    print(f"Accessibility permission: {'OK' if mac.accessibility_trusted() else 'NOT GRANTED'}")
    try:
        director = mac.director_processes()
        print("Running dLive Director process: " + (", ".join(director) if director else "NOT DETECTED"))
        apps = mac.installed_director_apps()
        print("Installed dLive Director app: " + (", ".join(str(x) for x in apps) if apps else "NOT FOUND"))
    except RuntimeError as exc:
        print(f"Director detection: {exc}")
    screen = mac.screen_capture_trusted()
    if screen is not None:
        print(f"Screen Recording permission: {'OK' if screen else 'NOT GRANTED (screenshots may fail)'}")
    print("Failsafe: moving the pointer into the top-left corner aborts between actions.")
    return 0 if mac.accessibility_trusted() else 1


def command_make_template(args: argparse.Namespace) -> int:
    path = Path(args.path)
    if path.exists() and not args.force:
        raise ConfigError(f"{path} already exists; use --force to replace it.")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        """version = 1\nname = \"480 Medium Echo 3-6\"\napplication_name = \"dLive Director\"\ncontrol_scenes = [\"CTL 1\", \"CTL 2\"]\nstart_row_offset = 0\n\n[[sweeps]]\ncontrol = \"echo3.time\"\nscene = \"E3 TIME {value}\"\nentry = \"{value}\"\nvalues = [0, 100, 200]\n\n[[sweeps]]\ncontrol = \"echo3.feedback\"\nscene = \"E3 FB {value}\"\nentry = \"{value}\"\nvalues = [-40, -10, 10]\n\n[[sweeps]]\ncontrol = \"echo4.time\"\nscene = \"E4 TIME {value}\"\nvalues = [0, 100, 200]\n\n[[sweeps]]\ncontrol = \"echo4.feedback\"\nscene = \"E4 FB {value}\"\nvalues = [-40, -10, 10]\n\n[[sweeps]]\ncontrol = \"echo5.time\"\nscene = \"E5 TIME {value}\"\nvalues = [0, 100, 200]\n\n[[sweeps]]\ncontrol = \"echo5.feedback\"\nscene = \"E5 FB {value}\"\nvalues = [-40, -10, 10]\n\n[[sweeps]]\ncontrol = \"echo6.time\"\nscene = \"E6 TIME {value}\"\nvalues = [0, 100, 200]\n\n[[sweeps]]\ncontrol = \"echo6.feedback\"\nscene = \"E6 FB {value}\"\nvalues = [-40, -10, 10]\n""",
        encoding="utf-8",
    )
    print(f"Wrote {path}")
    return 0


def command_calibrate(args: argparse.Namespace) -> int:
    sweep = load_sweep(args.sweep)
    if platform.system() != "Darwin":
        raise RuntimeError("Calibration requires macOS.")
    mac = MacAutomation()
    if not mac.accessibility_trusted():
        print("Accessibility permission is not granted. In macOS Settings, allow your Terminal/Python host under Privacy & Security > Accessibility, then rerun.", file=sys.stderr)
        return 2
    app_name = str(sweep.get("application_name", "dLive Director"))
    activated_name = mac.activate(app_name)
    print(f"Activated Director process: {activated_name}")
    print("\nCalibration does not click anything. It only records the current pointer position when you press Enter.")
    print("Keep Director on the screen/layout you plan to use for automation. Do not move/resize it after calibration.")
    captured: dict[str, list[float]] = {}
    captured["focus_safe"] = capture_point(mac, "1/8 Hover over a harmless blank area inside Director (used to focus the app).")
    captured["scene_manager"] = capture_point(mac, "2/8 Hover over the button/tab that opens Scene Manager.")
    captured["scene_first_row"] = capture_point(mac, "3/8 Open Scene Manager manually, then hover over the first scene row you want the automation to use.")
    captured["scene_second_row"] = capture_point(mac, "4/8 Hover over the very next scene row. This measures row spacing.")
    captured["store_button"] = capture_point(mac, "5/8 Hover over Director's Store/Store All button for the selected scene.")
    captured["scene_name_field"] = capture_point(mac, "6/8 Hover over the scene-name text field used while storing/updating the selected scene.")
    captured["scene_confirm"] = capture_point(mac, "7/8 Hover over the confirmation button that completes the store operation.")
    captured["return_processing"] = capture_point(mac, "8/8 Hover over the control that returns from Scene Manager to the RackUltra/processing view.")
    print("\nNow capture the actual parameter value fields. Navigate Director manually as needed before each capture.")
    for control in unique_controls(expand_sweep(sweep)):
        captured["control:" + control] = capture_point(mac, f"Parameter {control}: hover over the editable numeric value field.")
    profile = build_default_profile(sweep, captured)
    out = Path(args.profile)
    if out.exists() and not args.force:
        raise ConfigError(f"{out} already exists; use --force to replace it.")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(profile, indent=2), encoding="utf-8")
    print(f"\nSaved calibration profile: {out}")
    print("Run without --arm first to inspect the complete action plan.")
    return 0


def _resolve_point(profile: dict[str, Any], target: str, item: SweepItem, scene_slot: int) -> list[float]:
    if target == "control":
        if not item.control:
            raise ConfigError("Control point requested for a control scene.")
        point = profile["controls"][item.control]["point"]
        return [float(point[0]), float(point[1])]
    point = profile["points"].get(target)
    if point is None:
        raise ConfigError(f"Unknown point target: {target}")
    return [float(point[0]), float(point[1])]


def _scene_row_point(profile: dict[str, Any], scene_slot: int) -> list[float]:
    first = profile["points"]["scene_first_row"]
    step = profile["scene"]["row_step"]
    offset = int(profile["scene"].get("start_offset", 0)) + scene_slot
    return [float(first[0]) + float(step[0]) * offset, float(first[1]) + float(step[1]) * offset]


def _expand_action(action: dict[str, Any], profile: dict[str, Any], item: SweepItem, scene_slot: int) -> str:
    ctx = {"scene": item.scene, "value": item.value, "entry": item.entry or "", "control": item.control or "", "index": item.index, "scene_slot": scene_slot}
    if "click" in action:
        point = _resolve_point(profile, str(action["click"]), item, scene_slot)
        mods = "+".join(action.get("modifiers", ()))
        return f"{mods + '-' if mods else ''}click {action['click']} @ ({point[0]:.1f},{point[1]:.1f})"
    if action.get("click_control"):
        point = _resolve_point(profile, "control", item, scene_slot)
        clicks = int(profile["controls"][item.control]["clicks"])
        mods = "+".join(action.get("modifiers", ()))
        return f"{mods + '-' if mods else ''}click control {item.control} x{clicks} @ ({point[0]:.1f},{point[1]:.1f})"
    if action.get("click_scene_row"):
        mode=str(profile.get("scene",{}).get("row_mode","coordinate"))
        if mode=="selected" and scene_slot>0:
            return "select next scene row with Down Arrow"
        p = _scene_row_point(profile, scene_slot)
        return f"click scene row {scene_slot} @ ({p[0]:.1f},{p[1]:.1f})"
    if "type" in action:
        return "type " + repr(_fmt(str(action["type"]), **ctx))
    if "hotkey" in action:
        return "hotkey " + "+".join(action["hotkey"])
    if "key" in action:
        return "key " + str(action["key"])
    if "sleep" in action:
        return f"sleep {float(action['sleep']):.2f}s"
    return "unknown action " + repr(action)


def build_plan(sweep: dict[str, Any], profile: dict[str, Any]) -> list[dict[str, Any]]:
    errors = validate_profile_for_sweep(profile, sweep)
    if errors:
        raise ConfigError("Profile validation failed:\n  - " + "\n  - ".join(errors))
    plan = []
    scene_slot = 0
    for item in expand_sweep(sweep):
        actions: list[dict[str, Any]] = []
        if item.kind == "parameter":
            control_cfg = profile["controls"][item.control]
            actions.extend(control_cfg.get("set_workflow") or DEFAULT_SET_WORKFLOW)
        actions.extend(profile.get("scene", {}).get("workflow") or DEFAULT_SCENE_WORKFLOW)
        plan.append({"item": item, "scene_slot": scene_slot, "actions": actions})
        scene_slot += 1
    return plan


def _run_action(mac: MacAutomation, action: dict[str, Any], profile: dict[str, Any], item: SweepItem, scene_slot: int) -> None:
    ctx = {"scene": item.scene, "value": item.value, "entry": item.entry or "", "control": item.control or "", "index": item.index, "scene_slot": scene_slot}
    if "click" in action:
        mac.click(_resolve_point(profile, str(action["click"]), item, scene_slot), int(action.get("clicks", 1)), action.get("modifiers", ()))
    elif action.get("click_control"):
        cfg = profile["controls"][item.control]
        mac.click(cfg["point"], int(cfg.get("clicks", 1)), action.get("modifiers", ()))
    elif action.get("click_scene_row"):
        mode=str(profile.get("scene",{}).get("row_mode","coordinate"))
        if mode=="selected" and scene_slot>0:
            mac.key("down")
        else:
            mac.click(_scene_row_point(profile, scene_slot), int(action.get("clicks", 1)))
    elif "type" in action:
        mac.type_text(_fmt(str(action["type"]), **ctx))
    elif "hotkey" in action:
        mac.hotkey([str(x) for x in action["hotkey"]])
    elif "key" in action:
        mac.key(str(action["key"]))
    elif "sleep" in action:
        time.sleep(max(0.0, float(action["sleep"])))
    else:
        raise ConfigError(f"Unknown workflow action: {action}")


def _countdown(seconds: int) -> None:
    for n in range(seconds, 0, -1):
        print(f"Starting live automation in {n}…", end="\r", flush=True)
        time.sleep(1)
    print(" " * 50, end="\r")


def command_run(args: argparse.Namespace) -> int:
    sweep = load_sweep(args.sweep)
    profile = load_profile(args.profile)
    plan = build_plan(sweep, profile)
    full_count=len(plan)
    start=max(0,int(args.from_item))
    stop=full_count if args.to_item is None else min(full_count,int(args.to_item)+1)
    plan=[p for p in plan if start<=p["scene_slot"]<stop]
    if not plan:
        raise ConfigError("Selected item range is empty.")
    print(f"Sweep: {sweep.get('name', Path(args.sweep).stem)}")
    print(f"Scenes selected: {len(plan)} of {full_count} (items {plan[0]['scene_slot']}..{plan[-1]['scene_slot']})")
    for p in plan:
        item: SweepItem = p["item"]
        print(f"\n[{p['scene_slot']:03d}] {item.scene}" + (f"  [{item.control}={item.entry}]" if item.control else "  [control scene]"))
        for action in p["actions"]:
            print("   - " + _expand_action(action, profile, item, p["scene_slot"]))
    if not args.arm:
        print("\nDRY RUN ONLY. Re-run with --arm after checking the plan and Director layout.")
        return 0
    if platform.system() != "Darwin":
        raise RuntimeError("Live automation requires macOS.")
    mac = MacAutomation(action_delay=float(profile.get("action_delay", 0.12)), failsafe=not args.no_failsafe)
    if not mac.accessibility_trusted():
        print("Accessibility permission is not granted. Enable it for your Terminal/Python host under macOS Privacy & Security > Accessibility.", file=sys.stderr)
        return 2
    shot_cfg = profile.get("screenshots", {})
    shot_enabled = bool(shot_cfg.get("enabled", True)) and not args.no_screenshots
    shot_dir = Path(args.screenshot_dir or ("director-runs/" + time.strftime("%Y%m%d-%H%M%S")))
    app_name = str(profile["application_name"])
    print("\nLIVE MODE. Keep your hands off the mouse/keyboard unless aborting.")
    print("For safety, use an offline/Preview-mode Director instance, not a Director session controlling a live MixRack.")
    print("Move the pointer into the TOP-LEFT corner to trigger the failsafe between actions, or press Ctrl+C.")
    if not args.yes:
        ack=input("Type OFFLINE to confirm Director is not controlling live audio: ").strip()
        if ack != "OFFLINE":
            print("Live automation cancelled.")
            return 1
    _countdown(args.countdown)
    try:
        activated_name = mac.activate(app_name)
        print(f"Activated Director process: {activated_name}")
        mac.click(profile["points"]["focus_safe"])
        for p in plan:
            item: SweepItem = p["item"]
            slot = p["scene_slot"]
            print(f"[{slot}] {item.scene}")
            actions = p["actions"]
            set_boundary = len(profile["controls"][item.control].get("set_workflow") or DEFAULT_SET_WORKFLOW) if item.kind=="parameter" else 0
            for i, action in enumerate(actions):
                _run_action(mac, action, profile, item, slot)
                if shot_enabled and item.kind=="parameter" and shot_cfg.get("after_set", True) and i == set_boundary - 1:
                    mac.screenshot(shot_dir / f"{slot:03d}_{sanitize_filename(item.scene)}_set.png")
            if shot_enabled and shot_cfg.get("after_store", True):
                mac.screenshot(shot_dir / f"{slot:03d}_{sanitize_filename(item.scene)}_stored.png")
        print(f"\nCompleted {len(plan)} scene stores.")
        if shot_enabled:
            print(f"Screenshots: {shot_dir}")
        return 0
    except KeyboardInterrupt as exc:
        print(f"\nABORTED: {exc}", file=sys.stderr)
        return 130


def command_list(args: argparse.Namespace) -> int:
    sweep = load_sweep(args.sweep)
    for item in expand_sweep(sweep):
        if item.kind == "control":
            print(f"{item.index:03d} {item.scene} [control]")
        else:
            print(f"{item.index:03d} {item.scene} [{item.control} -> {item.entry}]")
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Create controlled dLive Director scenes using calibrated macOS UI automation")
    sub = p.add_subparsers(dest="command", required=True)
    q = sub.add_parser("doctor", help="check macOS automation permissions")
    q.set_defaults(func=command_doctor)
    q = sub.add_parser("make-template", help="write an Echo 3-6 TOML sweep template")
    q.add_argument("path")
    q.add_argument("--force", action="store_true")
    q.set_defaults(func=command_make_template)
    q = sub.add_parser("list", help="expand and print sweep scene names")
    q.add_argument("sweep")
    q.set_defaults(func=command_list)
    q = sub.add_parser("calibrate", help="capture Director click points for a sweep")
    q.add_argument("sweep")
    q.add_argument("profile")
    q.add_argument("--force", action="store_true")
    q.set_defaults(func=command_calibrate)
    q = sub.add_parser("run", help="print the action plan; add --arm to actually drive Director")
    q.add_argument("sweep")
    q.add_argument("profile")
    q.add_argument("--arm", action="store_true", help="enable live mouse/keyboard automation")
    q.add_argument("--countdown", type=int, default=5)
    q.add_argument("--no-failsafe", action="store_true", help="disable top-left pointer abort (not recommended)")
    q.add_argument("--no-screenshots", action="store_true")
    q.add_argument("--screenshot-dir")
    q.add_argument("--yes", action="store_true", help="skip the OFFLINE safety confirmation prompt")
    q.add_argument("--from-item", type=int, default=0, help="resume from this zero-based expanded item")
    q.add_argument("--to-item", type=int, help="stop after this zero-based expanded item")
    q.set_defaults(func=command_run)
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        return int(args.func(args))
    except (ConfigError, OSError, RuntimeError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
