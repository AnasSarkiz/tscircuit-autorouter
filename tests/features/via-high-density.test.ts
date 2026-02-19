import { expect, test } from "bun:test"
import { ViaHighDensitySolver } from "lib/solvers/ViaHighDensitySolver"
import input01 from "../../fixtures/features/via-high-density/via-high-density01-input.json" with {
  type: "json",
}
import input02 from "../../fixtures/features/via-high-density/via-high-density02-input.json" with {
  type: "json",
}
import input03 from "../../fixtures/features/via-high-density/via-high-density03-input.json" with {
  type: "json",
}

test("ViaHighDensitySolver01 - basic two crossing connections", () => {
  const solver = new ViaHighDensitySolver({
    nodeWithPortPoints: input01.nodeWithPortPoints as any,
    colorMap: input01.colorMap,
    hyperParameters: input01.hyperParameters,
    traceWidth: input01.traceWidth,
  })

  solver.solve()

  expect(solver.solved || solver.failed).toBe(true)

  if (solver.solved) {
    // Verify routes were created
    expect(solver.solvedRoutes.length).toBeGreaterThan(0)

    // Verify unused vias are filtered out
    const outputVias = solver.getOutputVias()
    for (const via of outputVias) {
      expect(via.connectedTo.length).toBeGreaterThan(0)
    }
  }

  expect(solver.visualize()).toMatchGraphicsSvg(import.meta.path, {
    svgName: "01",
  })
})

test("ViaHighDensitySolver02 - three connections with custom tile size", () => {
  const solver = new ViaHighDensitySolver({
    nodeWithPortPoints: input02.nodeWithPortPoints as any,
    colorMap: input02.colorMap,
    hyperParameters: input02.hyperParameters,
    traceWidth: input02.traceWidth,
  })

  solver.solve()

  expect(solver.solved || solver.failed).toBe(true)

  if (solver.solved) {
    // Verify routes were created
    expect(solver.solvedRoutes.length).toBeGreaterThan(0)

    // Verify unused vias are filtered out
    const outputVias = solver.getOutputVias()
    for (const via of outputVias) {
      expect(via.connectedTo.length).toBeGreaterThan(0)
    }
  }

  expect(solver.visualize()).toMatchGraphicsSvg(import.meta.path, {
    svgName: "02",
  })
})

test("ViaHighDensitySolver03 - four connections with shuffle seed", () => {
  const solver = new ViaHighDensitySolver({
    nodeWithPortPoints: input03.nodeWithPortPoints as any,
    colorMap: input03.colorMap,
    hyperParameters: input03.hyperParameters,
    traceWidth: input03.traceWidth,
  })

  solver.solve()

  expect(solver.solved || solver.failed).toBe(true)

  if (solver.solved) {
    // Verify routes were created
    expect(solver.solvedRoutes.length).toBeGreaterThan(0)

    // Verify unused vias are filtered out
    const outputVias = solver.getOutputVias()
    for (const via of outputVias) {
      expect(via.connectedTo.length).toBeGreaterThan(0)
    }
  }

  expect(solver.visualize()).toMatchGraphicsSvg(import.meta.path, {
    svgName: "03",
  })
})
