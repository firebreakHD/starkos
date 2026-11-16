# Original Roamies visual engine in STARK

Source: https://github.com/KenKaiii/Roamies at `e0ef435658a0206d5948142204f7be8ef5b1d969`.

The renderer is copied from the original source, not recreated from screenshots. `ink.js` implements the hand-drawn strokes, glass cards, measured text, layouts and interactive elements; `ink3d.js` supplies the original dependency-free WebGL models; `jarvis.js` draws the original reticle; `sfx.js` supplies the original synthesized drawing sounds; `world.js` supplies Natural Earth map outlines. The original Martian Mono and Doto fonts are included locally with their OFL licenses.

The original `draw.mjs` validates the native beats/marks contract, parses molecules and maths, layers flow diagrams, resolves maps and tracks drawing part IDs. Its original `safety.mjs` and country data are preserved. The original tool description is retained with its constants resolved and a STARK browser capability note appended. Server preparation uses public-address DNS validation and pinned, bounded HTTPS requests; image requests do not bypass STARK's source protections.

## Visual types

Cards, notes, lists, mind maps, exact source clippings, source links, photos, graphs, legends, timelines, molecules, moving 3D models, flow diagrams, tables, bar charts, maps, worked mathematics, geometry figures, quizzes, tickets and medals use the original renderer. Screen marks (rings, underlines, arrows, highlights and related shapes) target the STARK canvas. Text targets are resolved against the renderer's actual measured text bounds. Coordinate targets use the explicitly documented 0–1000 STARK workspace reference grid, not an invented desktop screenshot.

`see_photo` supplies the actual bounded image to Codex as app-server image input. Labels are accepted only for a photo inspected in that conversation, and the renderer receives that cached image. Source clips must match text retrieved through `read_source`; sources remain attributed claims, not guaranteed facts. Images are removed from stored text history after the current model turn, retaining the reference and the existing history budget.

## Phone adaptation

The original card drawing, fonts, colors, models and interactions remain. Text cards reflow into phone width at an enlarged drawing scale; only one card is focused at a time. Swiping between steps, pausing, resuming and voice commands use the existing control path. Wide tables, mind maps and technical diagrams keep their structure and support panning rather than being compressed to tiny text. Tall card content can be scrolled. Desktop retains the original simultaneous cards, pinning between answers and PNG export. Enter in the chat stays with the chat rather than activating the underlying menu.

The Voice button, menu ring, side chat gesture and direct HTTPS without login (when its password is empty) remain. Typed conversations only open the workspace when explicitly requested. The original explanation contract is retained as a compatibility path for existing sessions; the preferred model tool is `draw`.

## Browser boundary

Roamies' native Tauri shell, microphone helpers, desktop screenshot/OCR, clicking and typing in other applications are desktop-specific. This browser integration does not claim those actions work on an iPhone. Desktop action marks are refused; explicit interactive drawing buttons and source links act only when clicked. Codex remains the sole provider for Hermes/Jarvis, with its existing browser login. No second desktop agent is started.

Paired browser receivers advertise `ink.roamies` after loading this implementation. Receivers without the capability reject the command. Existing display pairing and token validation remain.

## Source and licenses

The combined STARK integration uses AGPL-3.0. The complete corresponding source, dependency lockfile, Dockerfile and build instructions are in https://github.com/firebreakHD/starkos and linked from settings. Upstream God’s Eye MIT notices are preserved. Font OFL and Natural Earth public-domain notices remain with their files. The manifest records original hashes; `ink.js` contains the documented phone, measured-text and host hooks. Other vendored JavaScript and draw helpers retain their original contents.

## Verification

`node --test server/stark/roamies.test.mjs` validates original visual structures, image-before-label behavior, per-conversation edits and bounded inputs. `node scripts/qa-roamies.mjs` exercises the real renderer and STARK tool routes with deterministic local fixtures across phone and desktop sizes. Native iPhone microphone hardware and live provider credentials are not simulated as verified hardware.
