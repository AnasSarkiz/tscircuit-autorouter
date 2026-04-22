import { expect, test } from "bun:test"
import { getSvgFromGraphicsObject } from "graphics-debug"
import { HyperSingleIntraNodeSolver } from "lib/solvers/HyperHighDensitySolver/HyperSingleIntraNodeSolver"
import cmn39NodeData from "../../fixtures/bug-reports/bugreport50-e1c376/cmn_39-node-data.json" with {
  type: "json",
}
import cmn645NodeData from "../../fixtures/bug-reports/bugreport50-e1c376/cmn_645__sub_0_0-node-data.json" with {
  type: "json",
}

const solveHighDensityNode = (nodeWithPortPoints: any) => {
  const solver = new HyperSingleIntraNodeSolver({
    nodeWithPortPoints,
    traceWidth: 0.15,
    viaDiameter: 0.3,
    effort: 1,
    cacheProvider: null,
  } as any)
  solver.solve()
  return solver
}

test("bugreport50 subnode cmn_645__sub_0_0 solves with default high-density settings", () => {
  const solver = solveHighDensityNode(cmn645NodeData.nodeWithPortPoints)

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  expect(
    getSvgFromGraphicsObject(solver.visualize(), {
      backgroundColor: "white",
    }),
  ).toMatchSvgSnapshot(import.meta.path, {
    svgName: "cmn_645__sub_0_0-default-hd-solved",
  })
}, 120_000)

test("bugreport50 subnode cmn_39 solves with default pipeline settings", () => {
  const solver = solveHighDensityNode(cmn39NodeData.nodeWithPortPoints)

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  expect(
    getSvgFromGraphicsObject(solver.visualize(), {
      backgroundColor: "white",
    }),
  ).toMatchSvgSnapshot(import.meta.path, {
    svgName: "cmn_39-default-hd-solved",
  })
}, 120_000)
