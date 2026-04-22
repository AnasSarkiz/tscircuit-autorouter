import { AutoroutingPipelineDebugger } from "lib/testing/AutoroutingPipelineDebugger"
import bugReportJson from "./bugreport50-e1c376.json"
import cmn645NodeData from "./cmn_645__sub_0_0-node-data.json" with {
  type: "json",
}

export default () => {
  const node = cmn645NodeData.nodeWithPortPoints
  return (
    <div className="p-2">
      <div className="mb-2 text-sm">
        bugreport50 full-board debugger (focus node: `cmn_645__sub_0_0`)
      </div>
      <div className="mb-2 text-xs text-gray-700">
        Node snapshot: {node.portPoints.length} port points, available Z{" "}
        {JSON.stringify(node.availableZ)}.
      </div>
      <AutoroutingPipelineDebugger srj={bugReportJson.simple_route_json} />
    </div>
  )
}
