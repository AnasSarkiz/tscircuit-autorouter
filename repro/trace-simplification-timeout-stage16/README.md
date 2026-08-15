# Pipeline 7 trace-simplification timeout reproduction

Pipeline 7 reached `traceSimplificationSolver` after
`highDensityStitchSolver`, then remained in trace simplification for more than
2 hours 40 minutes. The run was stopped before trace simplification completed.

## Relevant stage timings

- `portPointPathingSolver`: 3m 35s
- `highDensityRouteSolver`: 27m 6s
- `highDensityForceImproveSolver`: 21.7s
- `highDensityRepairSolver`: 0.5ms
- `highDensityStitchSolver`: 734ms
- `traceSimplificationSolver`: over 2h 40m, stopped before completion

## Artifacts

- `pipeline7-stage16-output.zip` is the untouched stage-16 export supplied with
  the report. It contains the high-density stitching PNG, SVG, and
  `GraphicsObject` JSON captured immediately before trace simplification.
- `stage-timings.png` is the timing screenshot from the same run.

The stage-16 `GraphicsObject` contains 62,036 lines, 62,441 points, and 753
circles. It is a visualization/handoff artifact rather than a serialized
`TraceSimplificationSolver` constructor payload: the original SimpleRouteJson,
obstacle list, and connectivity map are not present in the supplied archive.

## Integrity

```text
434ae776286f2deb579d4016151f2d7a250ac56bcdc0231e800db83928ee550e  pipeline7-stage16-output.zip
172a5ccd0219f3feb8f12dc08fdb74ce9dc0da0dcc81162885bedf3c1f660b26  stage-timings.png
```
