# Coding Standards

DeckForge code should make creative behavior dependable and future features easier to integrate. Standards apply to application code, audio work, services, tests, scripts, and documentation.

## Structure and ownership

- Organize code by domain and responsibility, with small modules and explicit public interfaces.
- Build reusable components for repeated controls, states, and visual patterns.
- Keep one canonical state owner for each domain. Derived views may cache data only with clear invalidation.
- Route playback through the shared audio and transport interfaces. Do not add parallel audio contexts, hidden media elements, duplicate schedulers, or feature-specific global controls.
- Separate source capabilities, project records, analysis, and interface state rather than encoding them in labels or DOM structure.

## Implementation quality

Names should describe musical intent and lifecycle. Functions should have focused side effects, and asynchronous work should expose loading, success, cancellation, and failure. Event listeners, timers, audio nodes, object URLs, and subscriptions require paired cleanup.

User-facing controls must perform their stated action. Do not ship placeholders disguised as active controls, swallow errors, or report success before persistence or playback has succeeded. Validate data at boundaries and preserve enough context to provide a useful recovery message.

Accessibility is part of component completion. Controls need semantic roles, labels, keyboard operation, visible focus, adequate contrast, and state announcements where appropriate. Pointer, touch, computer keyboard, and MIDI paths should converge on shared domain actions.

## Verification

Changes should include proportionate automated tests for state transitions, transformations, capability rules, and regressions. Audio and interaction work also requires a concise manual checklist across supported browsers and input methods. Performance-sensitive scheduling should be measured under realistic interface load.

Formatters and linters enforce consistency, but they do not replace review. Reviews should examine ownership, cleanup, failure paths, accessibility, security, and whether the implementation duplicates an existing service.

Documentation should describe contracts and intended behavior without claiming unverified implementation. Significant architecture decisions belong in versioned records, and feature baselines should identify what was actually tested.
