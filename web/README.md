# OpsGate UI preview

This is a dependency-free browser report explorer for Ops Drift Gate. It inherits the canonical Dripstatic Studios identity from the repository-root `DESIGN.md`, implemented for this surface in `tokens.css`. The default view is illustrative; it does not run the scanner or connect to a repository.

From the repository root, start a local static server:

```powershell
python -m http.server 8000 --directory web
```

To review a real scan, save the CLI's JSON output:

```powershell
ops-drift . --json > ops-drift-report.json
```

Open `http://localhost:8000`, choose **Review JSON report**, and select that file. Parsing and review stay in the browser; the file is not uploaded. The report must use schema version 1 and be no larger than 5 MB. **Download handoff brief** creates a local Markdown summary of findings, evidence paths, and missing custody fields. It intentionally excludes owner names, billing details, and recovery references; review evidence paths before sharing the brief.

The explorer supports findings and manifest views, filtering and searching (press `/` to focus search and `Esc` to clear it), inspection of evidence and custody status, copying sample YAML, and resetting the illustrative view. The service manifest includes owner, billing, transferability, recovery, and custody completeness. Scanner JSON exposes whether custody fields were recorded, not their values.

On narrow screens, manifest rows reflow into labeled fields without hiding custody fields. The top-bar **Mode** selector offers Standard, Signal, and Auto: Auto enables lightweight pointer effects only on fine-pointer devices that are not asking for reduced motion and do not report low hardware capacity. Signal adds pointer-local light, click response, attention-only texture, and evidence-confidence bars; reduced-motion preference always disables its motion.
