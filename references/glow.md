# Lit state

How to make what is live look live, and a few habits borrowed from another skill. This file covers only what [`craft.md`](craft.md), [`motion.md`](motion.md) and [`verify.md`](verify.md) do not already say. Read those first. Craft already asks for one lit accent and for light values for every glow.

Ideas here were taken from **iso-glow** (MIT License, Copyright (c) 2026 April Zhu; built on **iso-figure**, MIT License, Copyright (c) 2026 Tolga Cohce). No code is copied. Source: https://iso-glow.vercel.app. The tokens below are Anatomy's own.

## 1. Make the lit state unmistakable

A faint glow was the most common failure in the source skill's twenty figures. Test it at thumbnail size, not at full size. If you cannot tell which parts are live in a 200 px wide capture, raise the opacity of the lit fill before you add anything else.

- Use `--anatomy-lit`, `--anatomy-lit-top` and `--anatomy-lit-shade` for lit surfaces and `--anatomy-halo` with `--anatomy-halo-opacity` for the light around them. Do not write a colour in a figure.
- Give each figure at least one large lit element: a display, a lit floor band, a beam, a sign. A row of small lit dots does not read.
- In the light theme the same element stays a flat bright accent. Do not rely on a halo there.

```sh
node scripts/capture.mjs page.html --out shots/thumb.png --width 200
```

## 2. Every figure does something real

Name the output before you draw: typed text, a number, a sound, lights that switch, a part that moves. A figure that you can only watch is decoration. Pointer and keyboard call the same function. The readout is short and lowercase, for example `on · 9 chars`.

## 3. A starter and an assembler

For a weaker model or a short job, do not start from an empty file. Keep a complete small figure, and one script that inserts it into the page template. The script asserts that each anchor text exists before it replaces it, and stops if one is missing. This is the same idea as section 7 of [`equipment-demo.md`](equipment-demo.md).

## 4. Light that moves along a wire

A pulse is a small object with a route, a start delay and a duration. Each frame adds the elapsed time to it and lights the parts of the route near the matching fraction, then drops the object a little after its end. Time comes from the frame's elapsed seconds, so the speed does not depend on the frame rate, and several pulses can overlap. `pulse(route, delay, seconds)` and `drawPulses(dt)` in `examples/arcade-cabinet/live.js` are a working case.

## 5. Cleaning a user's own mesh

- Split it into named parts. Name the parts that must move or light.
- Check handedness against the real object. Mirror the mesh if it is reversed.
- Remove duplicate coincident faces. They flicker.
- Delete glass and other transparent panels. Leave an open frame.
- Set rotation pivots from the geometry, not from the origin.
- Credit a CC-BY model on the page: author, licence, and "restyled".

## 6. Not adopted from the source

| Source rule | Why Anatomy does not take it |
|---|---|
| Do not use a browser for checks | `verify.md` relies on a real browser. It found faults a read of the code did not. |
| A "Made with" footer | This is a branding choice, not a figure rule. |
| A second projection kernel (`box`, `plane`, `FRONT`) | `kit/iso-kit.mjs` is the kernel. Two kernels give two answers. |
| A script from a CDN | Pages must run from disk with no external request. |
