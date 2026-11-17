# Dripstatic Studios design identity

This is the canonical visual reference for Dripstatic Studios products, including SourceToMe, SourceInk, Static Swarm, Dripnote, and Ops Drift Gate. Product interfaces may have different layouts and task-specific states, but they share one family identity.

## Source of truth

Use the studio site and its source assets as authority:

- [Studio styles](https://dripstaticstudios.com/master.css?v=continuous-glow-1)
- [DSS core drip](https://dripstaticstudios.com/dss-core.svg)

Do not substitute a generic category palette or a one-off interpretation when these tokens apply.

## Brand palette

| Role | Token | Value | Use |
|---|---|---:|---|
| Background | DSS background | `#0b0710` | Shared dark field |
| Foreground | DSS foreground | `#f4efff` | Primary text |
| Drip highlight | DSS drip green | `#82ff9a` | Primary brand accent in surfaces derived from the core drip |
| Drip midtone | DSS green | `#2edb7f` | Green transitions and secondary emphasis |
| Drip shadow | DSS deep green | `#07532f` | The dark end of the core drip gradient |
| Studio green | DSS global green | `#75ff9b` | Existing global site token; preserve when matching that surface |
| Violet | DSS violet | `#ab77ff` | Secondary brand accent |
| Magenta | DSS magenta | `#ff4bd7` | Contrasting signal or attention state |
| Purple surface | DSS surface | `#21132f` | Controls and raised surfaces |
| Purple line | DSS line | `#634777` | Borders and keylines |

The DSS core drip uses `#82ff9a → #07532f`; treat that as a connected ramp, not unrelated swatches. Pale green `#b5fad3` may appear only as an occasional, approved transition or highlight derived from this ramp. It is not a default text, control, or status color. These are shared tokens, not a requirement to use every hue at equal scale: each product should follow its own approved color balance.

The studio site uses Inter for body text and Syne for display headings. Prefer those faces when already available; otherwise use a system sans fallback rather than adding an unapproved remote font dependency.

## Shared design grammar

- Keep the black-violet field, green drip signal, violet depth, and occasional magenta contrast recognizable across the product family.
- Keep large color fields deliberate. A product surface may be mostly neutral black; the palette does not require purple panels.
- Use the drip's form, scanline/grid texture, orbit, glow, and motion as source material; adapt their scale and energy to the task.
- Use rounded controls and surfaces in the studio's established register (8px controls; larger panels may be more generous).
- Let product-specific information and workflow lead. Do not copy the studio landing page's hero composition into a working tool.
- Keep status meaning legible through text and shape as well as color.
