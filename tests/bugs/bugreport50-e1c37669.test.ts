import { expect, test } from "bun:test"
import { AutoroutingPipelineSolver4 } from "lib/autorouter-pipelines/AutoroutingPipeline4_TinyHypergraph/AutoroutingPipelineSolver4_TinyHypergraph"
import bugReport from "../../fixtures/bug-reports/bugreport50-e1c37669/bugreport50-e1c37669.json" with {
  type: "json",
}
import type { SimpleRouteJson } from "lib/types"
import { getLastStepSvg } from "../fixtures/getLastStepSvg"

const srj =
  (bugReport as any).simple_route_json ??
  (bugReport as any).autorouting_bug_report?.simple_route_json

test("bugreport50-e1c37669.json-pipeline4", () => {
  expect(srj).toBeDefined()

  const solver = new AutoroutingPipelineSolver4(srj as SimpleRouteJson)
  solver.solve()

  expect(getLastStepSvg(solver.visualize())).toMatchSvgSnapshot(
    import.meta.path,
  )
}, 120_000)
