import { ViaHighDensitySolver } from "lib/solvers/ViaHighDensitySolver"
import { GenericSolverDebugger } from "lib/testing/GenericSolverDebugger"
import input from "./via-high-density02-input.json"

export default () => {
  const createSolver = () => {
    return new ViaHighDensitySolver({
      nodeWithPortPoints: input.nodeWithPortPoints as any,
      colorMap: input.colorMap,
      hyperParameters: input.hyperParameters,
      traceWidth: input.traceWidth,
    })
  }

  return <GenericSolverDebugger createSolver={createSolver} />
}
