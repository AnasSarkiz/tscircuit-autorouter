// @ts-nocheck
import { AutoroutingPipelineDebugger } from "lib/testing/AutoroutingPipelineDebugger"
import bugReportJson from "./bugreport50-e1c37669.json"
export default () => {
  const srj =
    (bugReportJson as any).simple_route_json ??
    (bugReportJson as any).autorouting_bug_report?.simple_route_json
  return <AutoroutingPipelineDebugger srj={srj} />
}
