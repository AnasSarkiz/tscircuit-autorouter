import { expect, test } from "bun:test"
import * as dataset01 from "@tscircuit/autorouting-dataset-01"
import { AutoroutingPipelineSolver4 } from "lib/autorouter-pipelines/AutoroutingPipeline4_TinyHypergraph/AutoroutingPipelineSolver4_TinyHypergraph"
import { Pipeline4HighDensityForceImproveSolver } from "lib/solvers/HighDensityForceImproveSolver/Pipeline4HighDensityForceImproveSolver"
import { Pipeline4HighDensityRepairSolver } from "lib/solvers/HighDensityRepairSolver/Pipeline4HighDensityRepairSolver"
import type {
  HighDensityRoute,
  NodeWithPortPoints,
} from "lib/types/high-density-types"
import type { SimpleRouteJson } from "lib/types"

const srj: SimpleRouteJson = {
  layerCount: 2,
  minTraceWidth: 0.15,
  minViaDiameter: 0.3,
  obstacles: [],
  connections: [
    {
      name: "conn1",
      pointsToConnect: [
        { x: -0.5, y: 0, layer: "top" },
        { x: 0.5, y: 0, layer: "top" },
      ],
    },
  ],
  bounds: {
    minX: -5,
    maxX: 5,
    minY: -5,
    maxY: 5,
  },
}

const nodeWithPortPoints: NodeWithPortPoints = {
  capacityMeshNodeId: "cmn_1",
  center: { x: 0, y: 0 },
  width: 2,
  height: 2,
  portPoints: [
    {
      connectionName: "conn1",
      x: -0.5,
      y: 0,
      z: 0,
    },
    {
      connectionName: "conn1",
      x: 0.5,
      y: 0,
      z: 0,
    },
  ],
}

const hdRoute: HighDensityRoute = {
  connectionName: "conn1",
  traceThickness: 0.15,
  viaDiameter: 0.3,
  route: [
    { x: -0.5, y: 0, z: 0 },
    { x: 0.5, y: 0, z: 0 },
  ],
  vias: [],
}

test("Pipeline4HighDensityRepairSolver preserves simple no-op routes", () => {
  const solver = new Pipeline4HighDensityRepairSolver({
    nodeWithPortPoints: [nodeWithPortPoints],
    hdRoutes: [hdRoute],
    obstacles: [],
    repairMargin: 0.2,
  })

  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  expect(solver.getOutput()).toEqual([hdRoute])
})

test("Pipeline4HighDensityForceImproveSolver preserves simple no-op routes", () => {
  const solver = new Pipeline4HighDensityForceImproveSolver({
    nodeWithPortPoints: [nodeWithPortPoints],
    hdRoutes: [hdRoute],
    totalStepsPerNode: 20,
  })

  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  expect(solver.getOutput()).toEqual([hdRoute])
  expect(solver.stats.acceptedNodeCount).toBe(0)
  expect(solver.stats.rejectedNodeCount).toBe(1)
})

test("Pipeline4HighDensityForceImproveSolver improves conflicting routes conservatively", () => {
  const conflictRoutes: HighDensityRoute[] = [
    {
      connectionName: "conn1",
      traceThickness: 0.15,
      viaDiameter: 0.3,
      route: [
        { x: -0.8, y: -0.05, z: 0 },
        { x: 0, y: -0.05, z: 0 },
        { x: 0.8, y: -0.05, z: 0 },
      ],
      vias: [],
    },
    {
      connectionName: "conn2",
      traceThickness: 0.15,
      viaDiameter: 0.3,
      route: [
        { x: -0.8, y: 0.05, z: 0 },
        { x: 0, y: 0.05, z: 0 },
        { x: 0.8, y: 0.05, z: 0 },
      ],
      vias: [],
    },
  ]

  const solver = new Pipeline4HighDensityForceImproveSolver({
    nodeWithPortPoints: [
      {
        ...nodeWithPortPoints,
        portPoints: [
          { connectionName: "conn1", x: -0.8, y: -0.05, z: 0 },
          { connectionName: "conn1", x: 0.8, y: -0.05, z: 0 },
          { connectionName: "conn2", x: -0.8, y: 0.05, z: 0 },
          { connectionName: "conn2", x: 0.8, y: 0.05, z: 0 },
        ],
      },
    ],
    hdRoutes: conflictRoutes,
    totalStepsPerNode: 30,
  })

  solver.solve()

  const output = solver.getOutput()
  expect(solver.stats.acceptedNodeCount).toBe(1)
  expect(output[0]?.route[0]).toEqual(conflictRoutes[0]?.route[0])
  expect(output[0]?.route.at(-1)).toEqual(conflictRoutes[0]?.route.at(-1))
  expect(output[1]?.route[0]).toEqual(conflictRoutes[1]?.route[0])
  expect(output[1]?.route.at(-1)).toEqual(conflictRoutes[1]?.route.at(-1))
  expect(
    Math.abs((output[0]?.route[1]?.y ?? 0) - (output[1]?.route[1]?.y ?? 0)),
  ).toBeGreaterThan(
    Math.abs(conflictRoutes[0]!.route[1]!.y - conflictRoutes[1]!.route[1]!.y),
  )
  for (const route of output) {
    for (const point of route.route) {
      expect(point.x).toBeGreaterThanOrEqual(-1)
      expect(point.x).toBeLessThanOrEqual(1)
      expect(point.y).toBeGreaterThanOrEqual(-1)
      expect(point.y).toBeLessThanOrEqual(1)
    }
  }
})

test("pipeline4 inserts force-improve stages around repair before stitching", () => {
  const solver = new AutoroutingPipelineSolver4(srj)
  const phaseNames = solver.pipelineDef.map((step) => step.solverName)

  expect(phaseNames.indexOf("highDensityRouteSolver")).toBeGreaterThanOrEqual(0)
  expect(phaseNames.indexOf("highDensityForceImproveSolver")).toBe(
    phaseNames.indexOf("highDensityRouteSolver") + 1,
  )
  expect(phaseNames.indexOf("highDensityRepairSolver")).toBe(
    phaseNames.indexOf("highDensityForceImproveSolver") + 1,
  )
  expect(phaseNames.indexOf("highDensityPostRepairForceImproveSolver")).toBe(
    phaseNames.indexOf("highDensityRepairSolver") + 1,
  )
  expect(phaseNames.indexOf("highDensityStitchSolver")).toBe(
    phaseNames.indexOf("highDensityPostRepairForceImproveSolver") + 1,
  )
})

test("pipeline4 repair stage consumes force-improved routes", () => {
  const solver = new AutoroutingPipelineSolver4(srj)
  const rawRoute: HighDensityRoute = {
    ...hdRoute,
    route: [
      { x: -0.5, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: 0.5, y: 0, z: 0 },
    ],
  }
  const improvedRoute: HighDensityRoute = {
    ...hdRoute,
    route: [
      { x: -0.5, y: 0, z: 0 },
      { x: 0, y: 0.15, z: 0 },
      { x: 0.5, y: 0, z: 0 },
    ],
  }

  solver.srjWithPointPairs = srj
  solver.highDensityRouteSolver = { routes: [rawRoute] } as any
  solver.highDensityForceImproveSolver = {
    getOutput: () => [improvedRoute],
  } as any

  const repairStep = solver.pipelineDef.find(
    (step) => step.solverName === "highDensityRepairSolver",
  )
  const [repairParams] = repairStep!.getConstructorParams(solver) as any

  expect(repairParams.hdRoutes).toEqual([improvedRoute])
})

test("pipeline4 stitch stage consumes repaired high density routes", () => {
  const rawRoute: HighDensityRoute = {
    ...hdRoute,
    route: [
      { x: -0.5, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: 0.5, y: 0, z: 0 },
    ],
  }
  const repairedRoute: HighDensityRoute = {
    ...hdRoute,
    route: [
      { x: -0.5, y: 0, z: 0 },
      { x: 0, y: 0.25, z: 0 },
      { x: 0.5, y: 0, z: 0 },
    ],
  }

  const solver = new AutoroutingPipelineSolver4(srj)
  solver.srjWithPointPairs = srj
  solver.highDensityRouteSolver = { routes: [rawRoute] } as any
  solver.highDensityPostRepairForceImproveSolver = {
    getOutput: () => [repairedRoute],
  } as any

  const stitchStep = solver.pipelineDef.find(
    (step) => step.solverName === "highDensityStitchSolver",
  )
  const [stitchParams] = stitchStep!.getConstructorParams(solver) as any

  expect(stitchParams.hdRoutes).toEqual([repairedRoute])
})

test("pipeline4 post-repair force-improve stage consumes repaired routes", () => {
  const repairedRoute: HighDensityRoute = {
    ...hdRoute,
    route: [
      { x: -0.5, y: 0, z: 0 },
      { x: 0, y: 0.25, z: 0 },
      { x: 0.5, y: 0, z: 0 },
    ],
  }

  const solver = new AutoroutingPipelineSolver4(srj)
  solver.srjWithPointPairs = srj
  solver.highDensityRouteSolver = { routes: [hdRoute] } as any
  solver.highDensityRepairSolver = {
    getOutput: () => [repairedRoute],
  } as any

  const postRepairForceImproveStep = solver.pipelineDef.find(
    (step) => step.solverName === "highDensityPostRepairForceImproveSolver",
  )
  const [postRepairParams] = postRepairForceImproveStep!.getConstructorParams(
    solver,
  ) as any

  expect(postRepairParams.hdRoutes).toEqual([repairedRoute])
})

test(
  "pipeline4 real case repair changes output routes",
  () => {
    const circuit003 = (dataset01 as Record<string, unknown>)
      .circuit003 as SimpleRouteJson
    const solver = new AutoroutingPipelineSolver4(circuit003)

    solver.solve()

    expect(solver.solved).toBe(true)
    expect(solver.failed).toBe(false)
    expect(solver.highDensityNodePortPoints?.length ?? 0).toBeGreaterThan(0)
    expect(
      solver.highDensityRepairSolver?.sampleEntries.length ?? 0,
    ).toBeGreaterThan(0)

    const inputRoutes = solver.highDensityRouteSolver?.routes ?? []
    const repairedRoutes = solver.highDensityRepairSolver?.getOutput() ?? []

    expect(repairedRoutes.length).toBe(inputRoutes.length)

    const changedRouteCount = repairedRoutes.filter((route, index) => {
      const inputRoute = inputRoutes[index]
      return (
        JSON.stringify(route.route) !== JSON.stringify(inputRoute?.route) ||
        JSON.stringify(route.vias) !== JSON.stringify(inputRoute?.vias)
      )
    }).length

    expect(changedRouteCount).toBeGreaterThan(0)
  },
  { timeout: 60000 },
)

test(
  "pipeline4 real case stitch step input equals post-repair force-improved output",
  () => {
    const circuit003 = (dataset01 as Record<string, unknown>)
      .circuit003 as SimpleRouteJson
    const solver = new AutoroutingPipelineSolver4(circuit003)

    solver.solve()

    const stitchStep = solver.pipelineDef.find(
      (step) => step.solverName === "highDensityStitchSolver",
    )
    const [stitchParams] = stitchStep!.getConstructorParams(solver) as any
    const polishedRoutes =
      solver.highDensityPostRepairForceImproveSolver?.getOutput() ?? []
    const rawRoutes = solver.highDensityRouteSolver?.routes ?? []

    expect(stitchParams.hdRoutes).toEqual(polishedRoutes)
    expect(stitchParams.hdRoutes.length).toBe(rawRoutes.length)

    const changedRouteCount = stitchParams.hdRoutes.filter(
      (route: HighDensityRoute, index: number) =>
        JSON.stringify(route.route) !==
          JSON.stringify(rawRoutes[index]?.route) ||
        JSON.stringify(route.vias) !== JSON.stringify(rawRoutes[index]?.vias),
    ).length

    expect(changedRouteCount).toBeGreaterThan(0)
  },
  { timeout: 60000 },
)
